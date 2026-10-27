// The proactive engine's registered Convex functions (PLAN.md -> Proactive engine). Every real decision
// lives in `convex/model/proactive.ts`; this file is the thin routing layer — internal only, nothing here
// is part of the public API (CONTRACT §4 lists no `proactive.*` functions; delivery is automatic).
import { v } from 'convex/values';
import { LIMITS } from '../shared/config';
import { chatCostCents, estimateChatCostCents } from '../shared/config/pricing';
import { delivery as deliveryValidator, notificationKind } from '../shared/domain/enums';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { getChatModel, getPushSender } from './adapters/registry';
import { isConcernCategory, logDroppedConcern } from './model/concernGate';
import {
  buildDraftJudgePrompt,
  buildPushMessages,
  deliverCandidateLogic,
  finalizeCandidateLogic,
  loadDraftContextFor,
  parseDraftJudgeResult,
  tickFamilyLogic,
} from './model/proactive';
import { createAnswerToken } from './model/pushAnswerToken';
import { ChatModelError } from './ports/chatModel';
import { clock } from './ports/clock';

// ---------- draft + judge ----------

export const loadDraftContext = internalQuery({
  args: { candidateId: v.id('candidates') },
  returns: v.union(
    v.object({
      familyId: v.id('families'),
      recipientName: v.string(),
      recipientRole: v.union(v.literal('admin'), v.literal('adult'), v.literal('kid')),
      megaName: v.string(),
      megaPersonalityBlurb: v.string(),
      seedText: v.string(),
      sentTodayCount: v.number(),
      reactionSummary: v.string(),
      sourceKind: v.union(v.literal('reminder'), v.literal('request'), v.literal('checkin'), v.literal('mattersTo')),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const data = await loadDraftContextFor(ctx, args.candidateId);
    if (!data) return null;
    const { source, ...rest } = data;
    return { ...rest, sourceKind: source.kind };
  },
});

export const processCandidate = internalAction({
  args: { candidateId: v.id('candidates') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.proactive.loadDraftContext, { candidateId: args.candidateId });
    if (!data || data.sourceKind === 'request') return null; // gone, already processed, or a request (handled synchronously — see createRequestCandidate)

    const { system, user, allowedKinds, fallbackKind } = buildDraftJudgePrompt({
      familyId: data.familyId,
      recipientName: data.recipientName,
      recipientRole: data.recipientRole,
      megaName: data.megaName,
      megaPersonalityBlurb: data.megaPersonalityBlurb,
      source: { kind: data.sourceKind } as never, // only `.kind` is read by buildDraftJudgePrompt/triggerInstruction
      seedText: data.seedText,
      sentTodayCount: data.sentTodayCount,
      reactionSummary: data.reactionSummary,
    });

    const model = getChatModel();
    const maxTokens = LIMITS.agent.maxTokensStructured;
    const estimatedCents = estimateChatCostCents(system.length + user.length, maxTokens);
    let reserved = false;
    try {
      await ctx.runMutation(internal.spend.requireBudget, { familyId: data.familyId, estimatedCents });
      reserved = true;
      const result = await model.chat({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        schema: { name: 'proactiveDraftJudge', schema: DRAFT_JUDGE_JSON_SCHEMA, strict: true },
        maxTokens,
        effort: LIMITS.agent.effort,
      });
      await ctx.runMutation(internal.spend.recordUsage, {
        familyId: data.familyId,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        cents: chatCostCents(result.usage.tokensIn, result.usage.tokensOut, result.usage.cachedTokensIn ?? 0),
        releaseCents: estimatedCents,
      });
      reserved = false;

      const parsed = parseDraftJudgeResult(result.text, fallbackKind, allowedKinds, data.seedText);

      // C6 (MEDIUM) / UX7 (HIGH): a kid-targeted draft gets the SAME independent, content-only concern
      // gate a memory save does (convex/model/concernGate.ts) before it's ever scheduled for delivery — a
      // mattersTo-sourced tip/update could easily carry concerning content about (or said by) a DIFFERENT
      // member into a kid's own notification tray ("Twin 1 is struggling at school" relayed straight to
      // Twin 1), which the draft+judge model call alone was never asked to screen for. Dropped + logged the
      // same way a concerning memory proposal is, never silently delivered.
      if (data.recipientRole === 'kid') {
        const { category } = await ctx.runAction(internal.agent.concernClassifier.classify, { familyId: data.familyId, text: `${parsed.title}. ${parsed.text}`, aboutNames: [] });
        if (isConcernCategory(category) && category !== 'ok') {
          await ctx.runMutation(internal.proactive.dropKidConcernCandidate, { candidateId: args.candidateId, category, text: parsed.text });
          return null;
        }
      }

      await ctx.runMutation(internal.proactive.finalizeCandidate, { candidateId: args.candidateId, ...parsed });
    } catch (e) {
      if (reserved) await ctx.runMutation(internal.spend.releaseReservation, { familyId: data.familyId, estimatedCents });
      if (e instanceof ChatModelError) {
        await ctx.runMutation(internal.proactive.dropCandidate, { candidateId: args.candidateId, reason: 'model unreachable' });
        return null;
      }
      throw e;
    }
    return null;
  },
});

// Kept as a plain object literal (not re-exported from model/proactive.ts) so the JSON-schema shape the
// model sees lives next to the `ctx.runAction` call that uses it; `DraftJudgeResult`'s TS type and this
// schema describe the same four fields on purpose.
const DRAFT_JUDGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['reminder', 'request', 'tip', 'update'] },
    title: { type: 'string' },
    text: { type: 'string' },
    score: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['kind', 'title', 'text', 'score', 'reason'],
  additionalProperties: false,
} as const;

export const finalizeCandidate = internalMutation({
  args: { candidateId: v.id('candidates'), kind: notificationKind, title: v.string(), text: v.string(), score: v.number(), reason: v.string(), forcedDelivery: v.optional(deliveryValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await finalizeCandidateLogic(ctx, args);
    return null;
  },
});

export const dropCandidate = internalMutation({
  args: { candidateId: v.id('candidates'), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (candidate && candidate.status === 'new') await ctx.db.patch(candidate._id, { status: 'dropped', reason: args.reason, delivery: 'drop' });
    return null;
  },
});

/** C6/UX7: the one atomic step behind a kid-targeted draft that failed the independent concern gate —
 * loads the candidate fresh (so it has a real `familyId`/`recipientId` to log against, rather than trusting
 * anything `processCandidate` computed earlier) and both logs and drops it together. */
export const dropKidConcernCandidate = internalMutation({
  args: { candidateId: v.id('candidates'), category: v.string(), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate || candidate.status !== 'new') return null;
    if (!isConcernCategory(args.category)) return null;
    const now = await clock.now(ctx, candidate.familyId);
    await logDroppedConcern(ctx, { familyId: candidate.familyId, memberId: candidate.recipientId, now }, args.text, args.category, 'kid-targeted draft failed the independent concern gate');
    await ctx.db.patch(candidate._id, { status: 'dropped', reason: `never-send: ${args.category} concern in a kid-targeted draft`, delivery: 'drop' });
    return null;
  },
});

// ---------- deliver ----------

export const deliverCandidate = internalMutation({
  args: { candidateId: v.id('candidates') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deliverCandidateLogic(ctx, args.candidateId);
    return null;
  },
});

// ---------- push ----------

export const loadPushContext = internalQuery({
  args: { notificationId: v.id('notifications') },
  returns: v.union(
    v.object({
      notification: v.any(),
      megaName: v.string(),
      threadId: v.id('threads'),
      messageId: v.id('messages'),
      recipientId: v.id('members'),
      settingsId: v.id('settings'),
      tokens: v.array(v.object({ token: v.string(), platform: v.union(v.literal('ios'), v.literal('android'), v.literal('web')) })),
      answerToken: v.string(),
      sourceKind: v.optional(v.union(v.literal('reminder'), v.literal('request'), v.literal('checkin'), v.literal('mattersTo'))),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || !notification.messageId) return null;
    const mega = await ctx.db.get(notification.megaId);
    const settings = await ctx.db
      .query('settings')
      .withIndex('by_family_member', (q) => q.eq('familyId', notification.familyId).eq('memberId', notification.recipientId))
      .unique();
    const message = await ctx.db.get(notification.messageId);
    if (!mega || !settings || !message) return null;
    const now = await clock.now(ctx, notification.familyId);
    // CONTRACT §5 v0.11: lets the push payload's background notification-response task answer with no
    // signed-in session (convex/model/pushAnswerToken.ts, convex/pushAnswer.ts). `answerToken` is additive
    // and optional — a deployment that hasn't set PUSH_ANSWER_SECRET yet still gets ordinary push delivery,
    // just without the killed-app answer path, rather than every push failing outright.
    let answerToken = '';
    try {
      answerToken = await createAnswerToken(notification._id, notification.recipientId, now);
    } catch (e) {
      console.log(`[proactive] notification ${notification._id}: couldn't create an answerToken (${e instanceof Error ? e.message : String(e)}) — sending push without one`);
    }
    // S5/UX4: which trigger produced this (if any), for the lock-screen redaction + grouping decisions
    // `buildPushMessages` makes — a legacy/hand-seeded notification with no candidate just gets neither.
    const candidate = notification.candidateId ? await ctx.db.get(notification.candidateId) : null;
    return {
      notification,
      megaName: mega.name,
      threadId: message.threadId,
      messageId: notification.messageId,
      recipientId: notification.recipientId,
      settingsId: settings._id,
      tokens: settings.pushTokens,
      answerToken,
      sourceKind: candidate?.source?.kind,
    };
  },
});

export const pruneTokens = internalMutation({
  args: { settingsId: v.id('settings'), deadTokens: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.deadTokens.length === 0) return null;
    const settings = await ctx.db.get(args.settingsId);
    if (!settings) return null;
    const dead = new Set(args.deadTokens);
    await ctx.db.patch(settings._id, { pushTokens: settings.pushTokens.filter((t) => !dead.has(t.token)) });
    return null;
  },
});

export const sendPush = internalAction({
  args: { notificationId: v.id('notifications') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.proactive.loadPushContext, { notificationId: args.notificationId });
    if (!data) return null;
    if (data.tokens.length === 0) {
      console.log(`[proactive] notification ${args.notificationId}: no registered push tokens for recipient ${data.recipientId}; delivered in-app only`);
      return null;
    }
    const notification = data.notification as Doc<'notifications'>;
    const messages = buildPushMessages(notification, data.megaName, data.threadId, data.messageId, data.tokens, data.answerToken, data.sourceKind);
    const results = await getPushSender().send(messages);
    const deadTokens = results.filter((r) => !r.ok && r.error === 'DeviceNotRegistered').map((r) => r.token);
    if (deadTokens.length) await ctx.runMutation(internal.proactive.pruneTokens, { settingsId: data.settingsId, deadTokens });
    console.log(`[proactive] notification ${args.notificationId}: push sent to ${results.filter((r) => r.ok).length}/${messages.length} token(s), pruned ${deadTokens.length}`);

    // C7: an "ok" send ticket isn't proof of delivery — Expo's docs describe `DeviceNotRegistered` (and
    // other failures) sometimes only showing up ~`LIMITS.push.receiptCheckDelayMinutes` later, in a
    // separate `getReceipts` poll. The ticket ids themselves are stored durably as this scheduled call's
    // own args (Convex persists scheduled-function args), so nothing needs a new table just to remember them.
    const tickets = results.filter((r) => r.ok && r.id).map((r) => ({ token: r.token, id: r.id! }));
    if (tickets.length) {
      await ctx.scheduler.runAfter(LIMITS.push.receiptCheckDelayMinutes * 60_000, internal.proactive.checkPushReceipts, { settingsId: data.settingsId, tickets });
    }
    return null;
  },
});

/** C7: the delayed half of Expo's two-phase delivery check — scheduled by `sendPush` above,
 * `LIMITS.push.receiptCheckDelayMinutes` after the initial send. Prunes a token whose receipt comes back
 * `DeviceNotRegistered` (the same real effect the immediate-ticket path already has); any OTHER receipt
 * error is logged rather than silently dropped, since it isn't necessarily "this token is dead." */
export const checkPushReceipts = internalAction({
  args: { settingsId: v.id('settings'), tickets: v.array(v.object({ token: v.string(), id: v.string() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.tickets.length === 0) return null;
    const receipts = await getPushSender().getReceipts(args.tickets.map((t) => t.id));
    const byId = new Map(receipts.map((r) => [r.id, r]));
    const deadTokens: string[] = [];
    for (const ticket of args.tickets) {
      const receipt = byId.get(ticket.id);
      if (!receipt || receipt.ok) continue;
      if (receipt.error === 'DeviceNotRegistered') deadTokens.push(ticket.token);
      else console.log(`[proactive] push receipt ${ticket.id}: ${receipt.error ?? 'unknown error'}`);
    }
    if (deadTokens.length) await ctx.runMutation(internal.proactive.pruneTokens, { settingsId: args.settingsId, deadTokens });
    return null;
  },
});

// ---------- tick (shared by clock.jump and the production cron — convex/crons.ts) ----------

export const tickFamily = internalMutation({
  args: { familyId: v.id('families') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await tickFamilyLogic(ctx, args.familyId);
    return null;
  },
});

/** The production cron's entry point (convex/crons.ts). Reading every family in one mutation is a
 * hackathon-scale exception, same as `model/spend.ts`'s documented global sum — fine for this build's
 * single/few-family scope, a redesign (per-family scheduled sweeps, or `@convex-dev/workpool`) before it
 * needs to handle many families at once. */
export const tickAllFamilies = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // `.take(1000)` rather than `.collect()`: still effectively "every family" at this hackathon's scale
    // (a handful), but never literally unbounded even in theory.
    const families = await ctx.db.query('families').take(1000);
    for (const f of families) await tickFamilyLogic(ctx, f._id);
    return null;
  },
});
