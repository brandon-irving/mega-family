// CONTRACT §4 "Chat and talk". `chat.send`/`chat.answerBlock` are day-1 stubs: `send` inserts the user's
// message plus an empty MEGA reply with a persistent-text-streaming stream, then schedules `generateReply`.
// The reply is server-driven: the action writes chunks with the component's addChunk mutation and every
// open client sees them through `chat.streamBody` (a reactive query). Nothing depends on the app staying
// open, which the proactive engine and push need anyway. G1 writes a canned reply; G2 swaps in the agent.
import { v } from 'convex/values';
import { PersistentTextStreaming, type StreamId } from '@convex-dev/persistent-text-streaming';
import { API } from '../shared/domain/api';
import { components, internal } from './_generated/api';
import { internalAction, internalMutation, mutation, query } from './_generated/server';
import { requireReadableStream } from './model/chat';
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
    await ctx.scheduler.runAfter(0, internal.chat.generateReply, { streamId, replyMessageId });

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

/** Writes the reply into its stream, then stores the final text on the message so the thread still reads
 * correctly after the component cleans up old streams. G2 replaces the canned text with the agent loop. */
export const generateReply = internalAction({
  args: { streamId: v.string(), replyMessageId: v.id('messages') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const words = CANNED_REPLY.split(' ');
    for (const [i, word] of words.entries()) {
      const final = i === words.length - 1;
      await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, { streamId: args.streamId as StreamId, text: final ? word : `${word} `, final });
    }
    await ctx.runMutation(internal.chat.finishReply, { replyMessageId: args.replyMessageId, text: CANNED_REPLY });
    return null;
  },
});

export const finishReply = internalMutation({
  args: { replyMessageId: v.id('messages'), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.replyMessageId);
    if (message?.body.type === 'text') await ctx.db.patch(message._id, { body: { ...message.body, text: args.text } });
    return null;
  },
});
