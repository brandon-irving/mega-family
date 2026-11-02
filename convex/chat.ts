import { answerConnectionRecommendation, answerConnectionRecommendationText, recommendConnection } from './model/connectionRecommendations';
import { CHAT_UX } from '../shared/config/chat';
import { answerMailLocation } from './model/mailContext';
import { answerConnectionApproval } from './model/connectionApproval';
import { activeDraft, migrateCreation, answerCreation, confirmDraft, resumeDraftConversation } from './model/megaCreation';
import { isCreationConfirmation, MEGA_CREATION } from '../shared/config/megaCreation';
import { answerBrief, answerBriefText, briefFor, startBrief, continueAfterBrief } from './model/assistantBriefs';
import { ASSISTANT_BRIEF } from '../shared/config/assistantBrief';
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
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from './_generated/server';
import { describeBlockAnswer, requireReadableStream } from './model/chat';
import { pick } from './model/define';
import { fail } from './model/errors';
import { detectSpokenMentions } from './model/mentions';
import { bumpProfileCount } from './model/proactive';
import { clock } from './ports/clock';
import { requireViewer } from './model/viewer';
import { summarizeAnswer } from '../shared/domain/answerLabel';
import { LIMITS } from '../shared/config';
import { AGENT_COPY, fillCopy, G5_COPY } from '../shared/config/copy';
import { ADULT_STARTER, KID_INTRO } from '../shared/config/starters';
import { getOrCreateOwnThread } from './model/threads';
import { onboardingRow } from './model/integrations';
import { parseNameReply, afterName as afterOnboardingName, answerFamilyBlock, postStep as postOnboardingStep, setName as setOnboardingName, stepIsShowing as onboardingStepIsShowing } from './model/onboarding';
import { answerCheckQuestion } from './model/profiler';
import { runFor } from './model/routines';
import { localDate } from '../shared/time';

const streaming = new PersistentTextStreaming(components.persistentTextStreaming);

/** The answer bubble already posted for a block (looked for just after it in its thread); the block itself when
 * none is found, so a repeat answer still returns an id without writing anything (v0.17b, C3). */
async function firstAnswerTo(ctx: MutationCtx, block: Doc<'messages'>): Promise<Id<'messages'>> {
  const after = await ctx.db
    .query('messages')
    .withIndex('by_family_thread_at', (q) => q.eq('familyId', block.familyId).eq('threadId', block.threadId).gte('at', block.at))
    .take(50);
  return after.find((m) => m.body.type === 'answer' && m.body.blockMessageId === block._id)?._id ?? block._id;
}

export const thread = query({
  ...pick(API.chat.thread),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    // A live subscription may briefly retain the previous profile’s cursor during a demo switch.
    // This is a cache key, never an authorization selector.
    if (args.profileKey && args.profileKey !== viewer.member._id) return { page: [], isDone: true, continueCursor: '' };
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
    let now = await clock.now(ctx, familyId);

    let thread = await ctx.db
      .query('threads')
      .withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', viewer.member._id))
      .unique();
    if (!thread) {
      const threadId = await ctx.db.insert('threads', { familyId, ownerId: viewer.member._id, megaIds: viewer.mega ? [viewer.mega._id] : [], lastAt: now });
      thread = (await ctx.db.get(threadId))!;
    }

    // Keep replies after their prompts even when the demo clock is paused.
    now = Math.max(now, thread.lastAt + 1);

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

    // Names can arrive inside a full introduction. Keep the message and let the model interpret
    // conversational replies; a validation error must never roll back an ordinary chat message.
    const onboarding = await onboardingRow(ctx, familyId, viewer.member._id);
    if (onboarding?.step === 'name' && viewer.mega) {
      const name = parseNameReply(args.text);
      const streamId = await streaming.createStream(ctx);
      const text = name ? fillCopy(G5_COPY.niceToMeet, { name }) : '';
      const replyMessageId = await ctx.db.insert('messages', { familyId, threadId: thread._id, at: now + 1, author: { kind: 'mega', id: viewer.mega._id }, via: 'text', body: { type: 'text', text }, streamId, chips: [] });
      await ctx.db.patch(thread._id, { lastAt: now + 1 });
      if (name) {
        await setOnboardingName(ctx, viewer.member, name, now);
        await ctx.scheduler.runAfter(0, internal.chat.streamFixedText, { streamId, text });
        await afterOnboardingName(ctx, viewer.member, now + 1);
      } else {
        await ctx.scheduler.runAfter(0, internal.onboardingConversation.reply, { familyId, memberId: viewer.member._id, replyMessageId, userText: args.text });
      }
      return { messageId, replyMessageId, streamId };
    }

    const connectionAnswer = !args.attachments?.length && !args.files?.length
      ? await answerConnectionRecommendationText(ctx, viewer.member, thread._id, args.text, now) : null;
    if (connectionAnswer) {
      const streamId = await streaming.createStream(ctx);
      await ctx.db.patch(connectionAnswer.replyMessageId, { streamId });
      await ctx.scheduler.runAfter(0, internal.chat.streamFixedText, { streamId, text: connectionAnswer.text });
      return { messageId, replyMessageId: connectionAnswer.replyMessageId, streamId };
    }
    await migrateCreation(ctx, viewer.member, thread._id, now);
    const draft = await activeDraft(ctx, viewer.member);
    if (draft?.status === 'review' && isCreationConfirmation(args.text) && !args.attachments?.length && !args.files?.length) {
      await confirmDraft(ctx, viewer.member, draft._id, draft.revision, now);
      const streamId = await streaming.createStream(ctx);
      const text = draft.data.target === 'self' ? MEGA_CREATION.created : MEGA_CREATION.inviteReady;
      const replies = await ctx.db.query('messages').withIndex('by_family_thread_at', q => q.eq('familyId', familyId).eq('threadId', thread._id)).order('desc').take(5);
      const reply = replies.find(m => m.ruleBlock === 'creation' && m.body.type === 'text');
      if (!reply) fail('NOT_FOUND');
      const replyMessageId = reply._id;
      await ctx.db.patch(replyMessageId, { streamId });
      await ctx.scheduler.runAfter(0, internal.chat.streamFixedText, { streamId, text });
      return { messageId, replyMessageId, streamId };
    }
    if (draft?.status === 'review') await resumeDraftConversation(ctx, draft, now);
    const brief = await briefFor(ctx, familyId, viewer.member._id);
    if (brief && brief.step !== 'done' && viewer.mega) {
      if (brief.step !== 'ready' && (args.attachments?.length || args.files?.length)) fail('VALIDATION', ASSISTANT_BRIEF.attachmentsLater);
      if (brief.step !== 'edit') await startBrief(ctx, viewer.member, now);
      const answered = !args.attachments?.length && !args.files?.length && await answerBriefText(ctx, viewer.member, args.text, now);
      if (answered) {
      const streamId = await streaming.createStream(ctx);
      const recent = answered ? await ctx.db.query('messages').withIndex('by_family_thread_at', q => q.eq('familyId', familyId).eq('threadId', thread._id)).order('desc').take(4) : [];
      const acknowledgement = recent.find(m => m.ruleBlock === 'brief' && m.body.type === 'text');
      const text = acknowledgement?.body.type === 'text' ? acknowledgement.body.text : ASSISTANT_BRIEF.pendingHint;
      let replyMessageId: Id<'messages'>;
      if (acknowledgement) {
        replyMessageId = acknowledgement._id;
        await ctx.db.patch(replyMessageId, { streamId });
      } else {
        const at = Math.max(now + 1, (await ctx.db.get(thread._id))!.lastAt + 1);
        replyMessageId = await ctx.db.insert('messages', { familyId, threadId: thread._id, at, author: { kind: 'mega', id: viewer.mega._id }, via: 'text', body: { type: 'text', text }, streamId, chips: [], ruleBlock: 'brief' });
        await ctx.db.patch(thread._id, { lastAt: at });
      }
      await ctx.scheduler.runAfter(0, internal.chat.streamFixedText, { streamId, text });
      return { messageId, replyMessageId, streamId };
      }
    }

    if (brief?.step === 'ready') await continueAfterBrief(ctx, brief, args.text, now);

    // G6 #6b (web walkthrough, Oct 29): a kid's "Ready for tomorrow" chat-starter (KID_INTRO.rows, "Show
    // me") used to send a free-text question straight into the agent loop, which has no tool for a kid's own
    // routineRuns and so just guessed — the live check saw it describe a different day's "water bottle and
    // shoes" instead of tonight's actual checklist. Show today's real routine card directly (the same
    // `{ kind: 'routine', runId }` card the proactive engine delivers, convex/model/routines.ts) — no model
    // call, so it can never drift from what routines.check/routines.today already say. Falls through to the
    // ordinary agent loop below when the kid has no run yet today (e.g. asked well before their bedtime/
    // morning routine time) — there's nothing concrete to ground an answer in yet.
    //
    // G6 review fix: only take the shortcut for a plain text message with nothing attached. It matched on
    // text alone before, which silently dropped an attached photo (the shortcut path never looks at
    // `args.attachments`) and, in voice/talk mode, returned `streamId: ''` — talk mode always needs a
    // readable text stream to caption, so that hung. Attachments and voice/talk now always fall through
    // to the normal agent-loop path below, which keeps the attachment and always starts a stream.
    const tomorrowAsk = KID_INTRO.rows.find((r) => r.id === 'tomorrow')!.ask;
    const noAttachments = !args.attachments?.length && !args.files?.length;
    if (viewer.member.role === 'kid' && args.text === tomorrowAsk && args.via === 'text' && noAttachments && viewer.mega) {
      const today = localDate(now, viewer.family.timezone);
      const run = (await runFor(ctx, familyId, viewer.member._id, 'bedtime', today)) ?? (await runFor(ctx, familyId, viewer.member._id, 'morning', today));
      if (run) {
        const replyMessageId = await ctx.db.insert('messages', {
          familyId,
          threadId: thread._id,
          at: now + 1,
          author: { kind: 'mega', id: viewer.mega._id },
          via: 'text',
          body: { type: 'card', card: { kind: 'routine', runId: run._id } },
          chips: [],
        });
        await ctx.db.patch(thread._id, { lastAt: now + 1 });
        // A card reply needs no text stream — pendingMegaStreamId (src/features/chat/pendingStream.ts) only
        // polls a message whose body is still `type: 'text'`; the empty id here is never looked up.
        return { messageId, replyMessageId, streamId: '' };
      }
    }

    for (const storageId of args.attachments ?? []) {
      await ctx.db.insert('messages', { familyId, threadId: thread._id, at: now, author: { kind: 'member', id: viewer.member._id }, via: args.via, body: { type: 'image', storageId }, chips: [] });
    }

    if ((args.files?.length ?? 0) > 4) fail('VALIDATION', 'Send up to four attachments at a time.');
    for (const file of args.files ?? []) {
      const metadata = await ctx.db.system.get('_storage', file.storageId);
      if (!metadata || metadata.size > 10 * 1024 * 1024) fail('VALIDATION', 'Choose a file smaller than 10 MB.');
      const mimeType = metadata.contentType ?? 'application/octet-stream';
      const name = file.name.trim().slice(0, 200) || 'Attachment';
      await ctx.db.insert('messages', { familyId, threadId: thread._id, at: now, author: { kind: 'member', id: viewer.member._id }, via: args.via,
        body: mimeType.startsWith('image/') ? { type: 'image', storageId: file.storageId, caption: name } : { type: 'file', storageId: file.storageId, name, mimeType }, chips: [] });
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
    const message = await requireReadableStream(ctx, viewer, args.streamId);
    if (message.stoppedAt !== undefined) return { text: message.body.type === 'text' ? message.body.text : '', status: 'done' as const };
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
    // v0.17b (C3): a block answered by rule (onboarding, a profiler check question) is answered once; a double-tap,
    // retry or replay is a no-op that returns the first answer and never starts an agent reply.
    if (message.ruleBlock && message.body.answeredWith !== undefined) return { answerMessageId: await firstAnswerTo(ctx, message) };

    const now = Math.max(await clock.now(ctx, viewer.member.familyId), thread.lastAt + 1);
    const answerMessageId = await ctx.db.insert('messages', {
      familyId: viewer.member.familyId,
      threadId: thread._id,
      at: now,
      author: { kind: 'member', id: viewer.member._id },
      via: args.via,
      // The words the member picked ("9:00 PM"), the same helper the app uses on a collapsed block.
      body: { type: 'answer', blockMessageId: message._id, label: summarizeAnswer(message.body.block, args.answer), value: args.answer },
      chips: [],
    });
    await ctx.db.patch(thread._id, { lastAt: now });
    await ctx.db.patch(message._id, { body: { ...message.body, answeredWith: args.answer } });

    // G5 (v0.17): the onboarding family step's blocks and the profiler's check questions are answered by rule,
    // not by an agent turn.
    if (await answerConnectionRecommendation(ctx, viewer.member, message, args.answer, now)) return { answerMessageId };
    if (await answerMailLocation(ctx, viewer.member, message, args.answer, now)) return { answerMessageId };
    if (await answerConnectionApproval(ctx, viewer.member, message, args.answer, now)) return { answerMessageId };
    if (await answerCreation(ctx, viewer.member, message, args.answer, now)) return { answerMessageId };
    if (await answerFamilyBlock(ctx, viewer.member, message, args.answer, now)) return { answerMessageId };
    const briefAnswer = await answerBrief(ctx, viewer.member, message, args.answer, now);
    if (briefAnswer && !briefAnswer.userText) return { answerMessageId };
    if (await answerCheckQuestion(ctx, viewer.member, message, args.answer, now)) return { answerMessageId };
    // A rule block no handler took (it has moved on, e.g. superseded after a resume) still never reaches the agent.
    if (message.ruleBlock && !briefAnswer?.userText) return { answerMessageId };

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
        userText: briefAnswer?.userText ?? describeBlockAnswer(message.body.block, args.answer),
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

/** CONTRACT v0.13b (owner, Oct 28: never an empty chat, MEGAs start the conversation). Runs once per thread
 * (`threads.startedAt`): a kid gets the KidsIntro messages straight from config (kid-safe, no model call);
 * an adult gets a greeting their MEGA writes through the agent loop (`generateStarter`), then a choice block.
 * MEGA cards already waiting (the seed posts chore/bedtime cards) don't count; a member who has already
 * written something is never started over. */
export const start = mutation({
  ...pick(API.chat.start),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const mega = viewer.mega;
    if (!mega) return { started: false };
    const familyId = viewer.member.familyId;
    const now = await clock.now(ctx, familyId);
    const thread = await getOrCreateOwnThread(ctx, familyId, viewer.member._id, mega._id, now);
    // G5 (v0.17): mid-onboarding, re-show the current step (the name question, a connect card, the family ask)
    // if it isn't in the thread, instead of the generic greeting; never twice.
    const onboarding = await onboardingRow(ctx, familyId, viewer.member._id);
    if (onboarding && onboarding.step !== 'done') {
      if (await onboardingStepIsShowing(ctx, onboarding, thread._id)) return { started: false };
      await postOnboardingStep(ctx, onboarding, now);
      if (thread.startedAt === undefined) await ctx.db.patch(thread._id, { startedAt: now });
      return { started: true };
    }
    if (await startBrief(ctx, viewer.member, now)) {
      if (thread.startedAt === undefined) await ctx.db.patch(thread._id, { startedAt: now });
      return { started: true };
    }
    if (thread.startedAt !== undefined) return { started: false };

    const recent = await ctx.db
      .query('messages')
      .withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', thread._id))
      .order('desc')
      .take(LIMITS.chat.starterLookback);
    await ctx.db.patch(thread._id, { startedAt: now });
    if (recent.some((m) => m.author.kind === 'member' && m.author.id === viewer.member._id)) return { started: false };

    const author = { kind: 'mega' as const, id: mega._id };
    const base = { familyId, threadId: thread._id, author, via: 'text' as const, chips: [] };
    if (viewer.member.role === 'kid') {
      const admin = (await ctx.db.query('members').withIndex('by_family', (q) => q.eq('familyId', familyId)).take(LIMITS.chat.starterLookback)).find((m) => m.role === 'admin');
      const slots = { name: viewer.member.name, mega: mega.name, admin: admin?.name ?? '' };
      await ctx.db.insert('messages', { ...base, at: now, body: { type: 'text', text: fillCopy(admin ? KID_INTRO.hello : KID_INTRO.helloNoAdmin, slots) } });
      await ctx.db.insert('messages', { ...base, at: now + 1, body: { type: 'card', card: { kind: 'intro' } } });
      await ctx.db.insert('messages', { ...base, at: now + 2, body: { type: 'text', text: fillCopy(KID_INTRO.tip, slots) } });
      await ctx.db.patch(thread._id, { lastAt: now + 2 });
      return { started: true };
    }

    const streamId = await streaming.createStream(ctx);
    const replyMessageId = await ctx.db.insert('messages', { ...base, at: now, body: { type: 'text', text: '' }, streamId });
    await ctx.db.patch(thread._id, { lastAt: now });
    await ctx.scheduler.runAfter(0, internal.chat.generateStarter, {
      streamId,
      replyMessageId,
      familyId,
      memberId: viewer.member._id,
      memberName: viewer.member.name,
      role: viewer.member.role,
      megaId: mega._id,
      megaName: mega.name,
      threadId: thread._id,
    });
    return { started: true };
  },
});

/** An adult's starter: the agent loop writes the greeting (it already knows what the family shared about
 * them), streamed like a reply; then the fixed "What should I learn about you first?" choices. The memory
 * writer doesn't run: nothing was said by the member yet. */
export const generateStarter = internalAction({
  args: {
    streamId: v.string(),
    replyMessageId: v.id('messages'),
    familyId: v.id('families'),
    memberId: v.id('members'),
    memberName: v.string(),
    role: v.union(v.literal('admin'), v.literal('adult'), v.literal('kid')),
    megaId: v.id('megas'),
    megaName: v.string(),
    threadId: v.id('threads'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let text = '';
    try {
      text = (await ctx.runAction(internal.agent.loop.runTurn, { familyId: args.familyId, memberId: args.memberId, role: args.role, megaId: args.megaId, threadId: args.threadId, userText: ADULT_STARTER.prompt, replyMessageId: args.replyMessageId })).text;
    } catch {
      text = ''; // over budget or the model is down: the config greeting still starts the chat
    }
    if (!text.trim() || text === AGENT_COPY.emptyReplyFallback || text === AGENT_COPY.modelUnreachable) {
      text = fillCopy(ADULT_STARTER.fallbackGreeting, { name: args.memberName, mega: args.megaName });
    }
    const words = text.split(' ');
    for (const [i, word] of words.entries()) {
      const final = i === words.length - 1;
      if (!await ctx.runMutation(internal.chat.appendReplyChunk, { streamId: args.streamId, text: final ? word : `${word} `, final })) return null;
    }
    if (!await ctx.runMutation(internal.chat.finishReply, { replyMessageId: args.replyMessageId, text })) return null;
    await ctx.runMutation(internal.chat.postStarterQuestion, { familyId: args.familyId, threadId: args.threadId, megaId: args.megaId });
    return null;
  },
});

export const postStarterQuestion = internalMutation({
  args: { familyId: v.id('families'), threadId: v.id('threads'), megaId: v.id('megas') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = await clock.now(ctx, args.familyId);
    await ctx.db.insert('messages', {
      familyId: args.familyId,
      threadId: args.threadId,
      at: now + 1,
      author: { kind: 'mega', id: args.megaId },
      via: 'text',
      body: { type: 'block', block: { kind: 'choice', prompt: ADULT_STARTER.question, multi: false, allowOther: true, options: ADULT_STARTER.options.map((o) => ({ ...o })) } },
      chips: [],
    });
    await ctx.db.patch(args.threadId, { lastAt: now + 1 });
    const thread = await ctx.db.get(args.threadId);
    const member = thread && await ctx.db.get(thread.ownerId);
    if (member && member.familyId === args.familyId) await recommendConnection(ctx, member, '', now + 2, { allowBaseline: true });
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
      replyMessageId: args.replyMessageId,
    });

    const words = text.split(' ');
    for (const [i, word] of words.entries()) {
      const final = i === words.length - 1;
      if (!await ctx.runMutation(internal.chat.appendReplyChunk, { streamId: args.streamId, text: final ? word : `${word} `, final })) return null;
    }
    if (!await ctx.runMutation(internal.chat.finishReply, { replyMessageId: args.replyMessageId, text })) return null;

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

/** G5: streams a fixed line (no model) into an already-written reply message, so the app animates it like any
 * reply (onboarding's "Nice to meet you"). The message already holds the final text. */
export const streamFixedText = internalAction({
  args: { streamId: v.string(), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { streamId, text }) => {
    await ctx.runMutation(internal.chat.appendReplyChunk, { streamId, text, final: true });
    return null;
  },
});

export const finishReply = internalMutation({
  args: { replyMessageId: v.id('messages'), text: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.replyMessageId);
    if (!message || message.stoppedAt !== undefined || message.body.type !== 'text') return false;
    await ctx.db.patch(message._id, { body: { ...message.body, text: args.text } });
    return true;
  },
});

/** Stop is owner-only even when a parent has read access to a child's stream. */
export const stop = mutation({
  ...pick(API.chat.stop),
  handler: async (ctx, { streamId }) => {
    const viewer = await requireViewer(ctx);
    const message = await requireReadableStream(ctx, viewer, streamId);
    const thread = await ctx.db.get(message.threadId);
    if (thread?.ownerId !== viewer.member._id || message.author.kind !== 'mega') fail('FORBIDDEN');
    if (message.stoppedAt !== undefined) return null;
    const stream = await streaming.getStreamBody(ctx, streamId as StreamId);
    if (stream.status === 'done' || stream.status === 'error' || stream.status === 'timeout') return null;
    await ctx.db.patch(message._id, { stoppedAt: Date.now(), body: { type: 'text', text: stream.text.trim() ? `${stream.text.trim()}\n\nResponse stopped.` : 'Response stopped.' }, saveableIdea: false });
    await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, { streamId: streamId as StreamId, text: '', final: true });
    return null;
  },
});
export const isStopped = internalQuery({
  args: { replyMessageId: v.id('messages') }, returns: v.boolean(),
  handler: async (ctx, { replyMessageId }) => {
    const message = await ctx.db.get(replyMessageId);
    return !message || message.stoppedAt !== undefined;
  },
});
/** The cancellation check and stream append share a transaction, so late chunks cannot reopen a reply. */
export const appendReplyChunk = internalMutation({
  args: { streamId: v.string(), text: v.string(), final: v.boolean() }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const message = await ctx.db.query('messages').withIndex('by_streamId', q => q.eq('streamId', args.streamId)).unique();
    if (!message || message.stoppedAt !== undefined) return false;
    await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, { ...args, streamId: args.streamId as StreamId });
    return true;
  },
});

// Presentation-only: never posts messages or marks the actual conversation as started.
export const entrance = query({
  ...pick(API.chat.entrance),
  handler: async (ctx, { profileKey }) => {
    const { member, mega } = await requireViewer(ctx);
    if (profileKey !== member._id || !mega) return { pending: false };
    const own = await ctx.db.query('threads').withIndex('by_family_owner', q => q.eq('familyId', member.familyId).eq('ownerId', member._id)).unique();
    if (!own) return { pending: true };
    if (own.entranceSeenAt !== undefined) return { pending: false };
    const recent = await ctx.db.query('messages').withIndex('by_family_thread_at', q => q.eq('familyId', member.familyId).eq('threadId', own._id)).order('desc').take(CHAT_UX.entrance.maxHistory);
    // Existing conversations must never be hidden by a newly shipped welcome animation.
    return { pending: recent.length < CHAT_UX.entrance.maxHistory && !recent.some(m => m.author.kind === 'member') };
  },
});
export const finishEntrance = mutation({
  ...pick(API.chat.finishEntrance),
  handler: async (ctx, { profileKey }) => {
    const { member, mega } = await requireViewer(ctx);
    if (profileKey !== member._id) fail('FORBIDDEN');
    const now = await clock.now(ctx, member.familyId);
    const own = await getOrCreateOwnThread(ctx, member.familyId, member._id, mega?._id ?? null, now);
    if (own.entranceSeenAt === undefined) await ctx.db.patch(own._id, { entranceSeenAt: now });
    return null;
  },
});
