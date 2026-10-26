// CONTRACT §4 "Chat and talk". `chat.send`/`chat.stream`/`chat.answerBlock` are day-1 stubs: `send` inserts
// the user's message plus a placeholder MEGA reply and creates a real persistent-text-streaming stream;
// the actual (canned) reply text is generated when the app opens the `/chat-stream` HTTP route, exactly
// the shape the component expects — there's no model wired up yet, only the plumbing.
import { PersistentTextStreaming, type StreamId } from '@convex-dev/persistent-text-streaming';
import { API } from '../shared/domain/api';
import { components } from './_generated/api';
import { httpAction, mutation, query } from './_generated/server';
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

/** Resolves a stream id back to its message and checks the caller may read it: their own thread, or a
 * kid's thread they parent with `parentsCanReadChat` on. Guards `chat.streamBody` against probing another
 * family's stream ids (CLAUDE.md → every read keyed by an opaque id still needs a server-side check). */
async function requireReadableStream(ctx: Parameters<typeof requireViewer>[0], viewer: Awaited<ReturnType<typeof requireViewer>>, streamId: string) {
  const message = await ctx.db
    .query('messages')
    .withIndex('by_streamId', (q) => q.eq('streamId', streamId))
    .unique();
  if (!message || message.familyId !== viewer.member.familyId) fail('NOT_FOUND');
  const thread = await ctx.db.get(message.threadId);
  if (!thread) fail('NOT_FOUND');
  if (thread.ownerId === viewer.member._id) return message;
  if (viewer.isParentOf.includes(thread.ownerId)) {
    const controls = await ctx.db
      .query('kidControls')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', thread.ownerId))
      .unique();
    if (controls?.parentsCanReadChat) return message;
  }
  fail('FORBIDDEN');
}

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

/** CONTRACT §4 `chat.stream` (`POST /chat-stream { streamId }`). Routed from `convex/http.ts`. */
export const streamChat = httpAction(async (ctx, request) => {
  const { streamId } = (await request.json()) as { streamId: string };
  const response = await streaming.stream(ctx, request, streamId as StreamId, async (_ctx, _request, _id, append) => {
    for (const word of CANNED_REPLY.split(' ')) await append(`${word} `);
  });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Vary', 'Origin');
  return response;
});
