// CONTRACT §4 "Chat and talk". `chat.send`/`chat.stream`/`chat.answerBlock` are day-1 stubs: `send` inserts
// the user's message plus a placeholder MEGA reply and creates a real persistent-text-streaming stream;
// the actual (canned) reply text is generated when the app opens the `/chat-stream` HTTP route, exactly
// the shape the component expects — there's no model wired up yet, only the plumbing.
import { v } from 'convex/values';
import { PersistentTextStreaming, type StreamId } from '@convex-dev/persistent-text-streaming';
import { API } from '../shared/domain/api';
import { components, internal } from './_generated/api';
import { httpAction, internalQuery, mutation, query } from './_generated/server';
import { requireReadableStream } from './model/chat';
import { withCors } from './model/cors';
import { pick } from './model/define';
import { fail } from './model/errors';
import { detectSpokenMentions } from './model/mentions';
import { clock } from './ports/clock';
import { requireViewer } from './model/viewer';

const streaming = new PersistentTextStreaming(components.persistentTextStreaming);

/** A stub reply until the chat agent loop is built. Kept to one line so the point — the plumbing, not the
 * model — stays obvious in demos. */
const CANNED_REPLY = "Got it — I'm still learning how to answer for real, but I've saved that.";

export const thread = query({
  ...pick(API.chat.thread),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const own = await ctx.db
      .query('threads')
      .withIndex('by_family_owner', (q) => q.eq('familyId', viewer.member.familyId).eq('ownerId', viewer.member._id))
      .unique();
    if (!own) return { page: [], isDone: true, continueCursor: '' };
    return ctx.db
      .query('messages')
      .withIndex('by_family_thread_at', (q) => q.eq('familyId', viewer.member.familyId).eq('threadId', own._id))
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

export const send = mutation({
  ...pick(API.chat.send),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const familyId = viewer.member.familyId;
    const now = await clock.now(ctx, familyId);

    let thread = await ctx.db
      .query('threads')
      .withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', viewer.member._id))
      .unique();
    if (!thread) {
      const threadId = await ctx.db.insert('threads', { familyId, ownerId: viewer.member._id, megaIds: viewer.mega ? [viewer.mega._id] : [], lastAt: now });
      thread = (await ctx.db.get(threadId))!;
    }

    const familyMegas = await ctx.db
      .query('megas')
      .withIndex('by_family_owner', (q) => q.eq('familyId', familyId))
      .collect();
    for (const id of args.mentions ?? []) if (!familyMegas.some((m) => m._id === id)) fail('VALIDATION', 'unknown MEGA mention');

    const mentionIds = new Set(args.mentions ?? []);
    if (args.via === 'voice') {
      for (const m of detectSpokenMentions(args.text, familyMegas.map((m) => ({ megaId: m._id, name: m.name })))) mentionIds.add(m.megaId);
    }

    const messageId = await ctx.db.insert('messages', {
      familyId,
      threadId: thread._id,
      at: now,
      author: { kind: 'member', id: viewer.member._id },
      via: args.via,
      body: { type: 'text', text: args.text, mentions: mentionIds.size ? [...mentionIds] : undefined },
      chips: [],
    });
    for (const storageId of args.attachments ?? []) {
      await ctx.db.insert('messages', { familyId, threadId: thread._id, at: now, author: { kind: 'member', id: viewer.member._id }, via: args.via, body: { type: 'image', storageId }, chips: [] });
    }

    const newMegaIds = new Set(thread.megaIds);
    for (const id of mentionIds) newMegaIds.add(id);
    if (newMegaIds.size !== thread.megaIds.length) await ctx.db.patch(thread._id, { megaIds: [...newMegaIds] });

    const replyMegaId = mentionIds.size ? [...mentionIds][0] : viewer.mega?._id;
    if (!replyMegaId) fail('VALIDATION', 'no MEGA available to reply');
    const streamId = await streaming.createStream(ctx);
    const replyMessageId = await ctx.db.insert('messages', {
      familyId,
      threadId: thread._id,
      at: now + 1, // sorts after the user's message even when `at` would otherwise tie
      author: { kind: 'mega', id: replyMegaId },
      via: 'text',
      body: { type: 'text', text: '' }, // the real text lives in the stream; see chat.streamBody
      streamId,
      chips: [],
    });
    await ctx.db.patch(thread._id, { lastAt: now + 1 });

    return { messageId, replyMessageId, streamId };
  },
});

export const streamBody = query({
  ...pick(API.chat.streamBody),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    await requireReadableStream(ctx, viewer, args.streamId);
    return streaming.getStreamBody(ctx, args.streamId as StreamId);
  },
});

export const answerBlock = mutation({
  ...pick(API.chat.answerBlock),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message || message.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    const thread = await ctx.db.get(message.threadId);
    if (!thread || thread.ownerId !== viewer.member._id) fail('FORBIDDEN');
    if (message.body.type !== 'block') fail('VALIDATION', 'not a block message');

    const now = await clock.now(ctx, viewer.member.familyId);
    const answerMessageId = await ctx.db.insert('messages', {
      familyId: viewer.member.familyId,
      threadId: thread._id,
      at: now,
      author: { kind: 'member', id: viewer.member._id },
      via: args.via,
      body: { type: 'answer', blockMessageId: message._id, label: 'Answered', value: args.answer },
      chips: [],
    });
    await ctx.db.patch(message._id, { body: { ...message.body, answeredWith: args.answer } });
    return { answerMessageId };
  },
});

export const react = mutation({
  ...pick(API.chat.react),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message || message.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    const thread = await ctx.db.get(message.threadId);
    if (!thread || thread.ownerId !== viewer.member._id) fail('FORBIDDEN');
    await ctx.db.patch(message._id, { reaction: args.reaction ?? undefined });
    return null;
  },
});

/** httpAction ctx has no `ctx.db` (only `runQuery`/`runMutation`/`runAction`), so the ownership check
 * (`requireReadableStream`) has to live behind a query `streamChat` can call — this is that query, not a
 * public API entry (nothing else needs it; `chat.streamBody` runs the same check directly against its
 * own query ctx). Throws the same codes `requireReadableStream`/`requireViewer` would. */
export const canReadStream = internalQuery({
  args: { streamId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    await requireReadableStream(ctx, viewer, args.streamId);
    return null;
  },
});

/** CONTRACT §4 `chat.stream` (`POST /chat-stream { streamId }`). Routed from `convex/http.ts`. G1 fix:
 * this used to stream to anyone who knew a `streamId` — no auth, no ownership check — with CORS wide
 * open (`Access-Control-Allow-Origin: *`). Now requires the same identity + ownership/parent check as
 * `chat.streamBody`, and the same trustedOrigins-based CORS as the auth routes (convex/model/cors.ts). */
export const streamChat = httpAction(async (ctx, request) => {
  const { streamId } = (await request.json()) as { streamId: string };
  try {
    await ctx.runQuery(internal.chat.canReadStream, { streamId });
  } catch {
    return withCors(request, new Response(null, { status: 403 }));
  }
  const response = await streaming.stream(ctx, request, streamId as StreamId, async (_ctx, _request, _id, append) => {
    for (const word of CANNED_REPLY.split(' ')) await append(`${word} `);
  });
  return withCors(request, response);
});
