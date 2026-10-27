// CONTRACT §4 "Chat and talk". `chat.send` inserts the user's message plus an empty MEGA reply with a
// persistent-text-streaming stream, then schedules `generateReply`. The reply is server-driven: the action
// writes chunks with the component's addChunk mutation and every open client sees them through
// `chat.streamBody` (a reactive query). Nothing depends on the app staying open, which the proactive engine
// and push need anyway. G2: `generateReply` runs the real agent loop (convex/agent/loop.ts) instead of a
// canned reply, and schedules the memory writer (convex/agent/writer.ts) after.
import { v } from 'convex/values';
import { PersistentTextStreaming, type StreamId } from '@convex-dev/persistent-text-streaming';
import { API } from '../shared/domain/api';
import { components, internal } from './_generated/api';
import { internalAction, internalMutation, mutation, query } from './_generated/server';
import { describeBlockAnswer, requireReadableStream } from './model/chat';
import { pick } from './model/define';
import { fail } from './model/errors';
import { detectSpokenMentions } from './model/mentions';
import { bumpProfileCount } from './model/proactive';
import { clock } from './ports/clock';
import { requireViewer } from './model/viewer';

const streaming = new PersistentTextStreaming(components.persistentTextStreaming);

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
    await ctx.scheduler.runAfter(0, internal.chat.generateReply, {
      streamId,
      replyMessageId,
      familyId,
      memberId: viewer.member._id,
      memberName: viewer.member.name,
      role: viewer.member.role,
      megaId: replyMegaId,
      threadId: thread._id,
      userText: args.text,
    });

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

    // Feed the answer back into the agent loop (task brief: "chat.answerBlock should feed the answer back
    // into the loop"), as an ordinary turn from the same MEGA that asked — the member sees a real reply,
    // not a block that just silently collapses.
    const replyMegaId = message.author.kind === 'mega' ? message.author.id : viewer.mega?._id;
    let streamId: string | undefined;
    if (replyMegaId) {
      streamId = await streaming.createStream(ctx);
      const replyMessageId = await ctx.db.insert('messages', {
        familyId: viewer.member.familyId,
        threadId: thread._id,
        at: now + 1,
        author: { kind: 'mega', id: replyMegaId },
        via: 'text',
        body: { type: 'text', text: '' },
        streamId,
        chips: [],
      });
      await ctx.db.patch(thread._id, { lastAt: now + 1 });
      await ctx.scheduler.runAfter(0, internal.chat.generateReply, {
        streamId,
        replyMessageId,
        familyId: viewer.member.familyId,
        memberId: viewer.member._id,
        memberName: viewer.member.name,
        role: viewer.member.role,
        megaId: replyMegaId,
        threadId: thread._id,
        userText: describeBlockAnswer(message.body.block, args.answer),
      });
    }
    // CONTRACT.md v0.8 (additive, pending approval): the reply's streamId, so talk mode can caption the
    // MEGA's follow-up reply the same way it captions a normal chat.send reply.
    return { answerMessageId, streamId };
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
    // PLAN.md -> Proactive engine: "👍/👎 feedback that tunes future messages" — a reaction on the card a
    // notification was mirrored into (CONTRACT §2 `messages.fromNotificationId`) feeds the judge's
    // per-kind counts (convex/model/proactive.ts `loadDraftContextFor`'s `reactionSummary`).
    if ((args.reaction === 'up' || args.reaction === 'down') && message.fromNotificationId) {
      const notification = await ctx.db.get(message.fromNotificationId);
      if (notification) await bumpProfileCount(ctx, viewer.member.familyId, viewer.member._id, notification.kind, args.reaction);
    }
    return null;
  },
});

/** Runs the agent loop (convex/agent/loop.ts), writes the final text into the stream a word at a time so
 * the UI still animates (no incremental model streaming yet — PLAN.md → "streaming if the API supports it;
 * if not, chunk the final text"), stores it on the message, then schedules the memory writer. */
export const generateReply = internalAction({
  args: {
    streamId: v.string(),
    replyMessageId: v.id('messages'),
    familyId: v.id('families'),
    memberId: v.id('members'),
    memberName: v.string(),
    role: v.union(v.literal('admin'), v.literal('adult'), v.literal('kid')),
    megaId: v.id('megas'),
    threadId: v.id('threads'),
    userText: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { text } = await ctx.runAction(internal.agent.loop.runTurn, {
      familyId: args.familyId,
      memberId: args.memberId,
      role: args.role,
      megaId: args.megaId,
      threadId: args.threadId,
      userText: args.userText,
    });

    const words = text.split(' ');
    for (const [i, word] of words.entries()) {
      const final = i === words.length - 1;
      await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, { streamId: args.streamId as StreamId, text: final ? word : `${word} `, final });
    }
    await ctx.runMutation(internal.chat.finishReply, { replyMessageId: args.replyMessageId, text });

    await ctx.scheduler.runAfter(0, internal.agent.writer.run, {
      familyId: args.familyId,
      memberId: args.memberId,
      memberName: args.memberName,
      role: args.role,
      megaId: args.megaId,
      threadId: args.threadId,
      replyMessageId: args.replyMessageId,
      userText: args.userText,
      replyText: text,
    });
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
