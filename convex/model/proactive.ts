// The proactive engine's actual logic (PLAN.md -> Proactive engine: "trigger -> candidate (dedupeKey) ->
// draft -> judge -> timing -> deliver"). `convex/proactive.ts` is the thin registered-function layer; every
// real decision lives here as plain functions so the pipeline is testable without going through Convex's
// function-call machinery, same split as `today.ts`/`model/home.ts`.
//
// Clock discipline (task brief; PLAN.md -> Proactive engine "Clock"): every function here takes `now` as an
// argument (read once, by the caller, through the Clock port) rather than calling it itself — the demo's
// simulated-clock jump and the production cron both drive the exact same code, just with a different `now`.
import { PERSONALITIES } from '../../shared/config/looks';
import { ANDROID_CHANNELS, BUTTON_SETS, NOTIFICATION_KINDS_CONFIG } from '../../shared/config/notifications';
import { PROACTIVE, checkinDedupeKey, mattersToDedupeKey, reminderDedupeKey, requestDedupeKey } from '../../shared/config/proactive';
import { NOTIFICATION_KINDS, type Delivery, type Loudness, type NotificationKind, type Role } from '../../shared/domain/enums';
import type { CandidateSource } from '../../shared/domain/tables';
import { addDays, localDate, localParts, zonedInstant } from '../../shared/time';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { clock } from '../ports/clock';
import type { PushMessage } from '../ports/pushSender';
import { getOrCreateOwnThread } from './threads';

type Ctx = QueryCtx | MutationCtx;

// ---------- quiet hours + timing ----------

function parseHM(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** Whether a given instant falls inside a `{start,end}` "HH:MM" quiet-hours window, which may wrap
 * midnight (e.g. 22:00-07:00). `start === end` means "no quiet hours" (never holds anything back). */
export function isInQuietHours(at: number, tz: string, quiet: { start: string; end: string }): boolean {
  const start = parseHM(quiet.start);
  const end = parseHM(quiet.end);
  if (start === end) return false;
  const p = localParts(at, tz);
  const nowMin = p.hour * 60 + p.minute;
  if (start < end) return nowMin >= start && nowMin < end;
  return nowMin >= start || nowMin < end;
}

/** The instant quiet hours (containing `at`) end. Only meaningful when `isInQuietHours(at, tz, quiet)`. */
export function quietHoursEndInstant(at: number, tz: string, quiet: { start: string; end: string }): number {
  const start = parseHM(quiet.start);
  const end = parseHM(quiet.end);
  const today = localDate(at, tz);
  const p = localParts(at, tz);
  const nowMin = p.hour * 60 + p.minute;
  if (start < end) return zonedInstant(today, end, tz);
  // wraps midnight: currently after `start` (tonight) -> ends tomorrow; currently before `end` (past
  // midnight already) -> ends today.
  return nowMin >= start ? zonedInstant(addDays(today, 1), end, tz) : zonedInstant(today, end, tz);
}

/** Shifts a desired delivery instant past quiet hours if it would otherwise land inside them. Applied to
 * every kind, not just kids (PLAN.md's push section calls out kids explicitly, but every member has their
 * own `notify.quietHours`/`kidControls.quietHours` — CONTRACT §2 — so the same rule reads correctly for
 * everyone: an adult's phone shouldn't buzz at 2am either). */
export function quietHoursAdjust(desired: number, tz: string, quiet: { start: string; end: string }): number {
  return isInQuietHours(desired, tz, quiet) ? quietHoursEndInstant(desired, tz, quiet) : desired;
}

/** The recipient's own quiet hours: `kidControls` for a kid, `settings.notify.quietHours` otherwise
 * (CONTRACT §2). Falls back to "no quiet hours" if neither row exists (shouldn't happen for a real member —
 * every seeded/onboarded member gets one — but a missing row should never crash delivery). */
export async function quietHoursForMember(ctx: Ctx, familyId: Id<'families'>, member: Doc<'members'>): Promise<{ start: string; end: string }> {
  if (member.role === 'kid') {
    const controls = await ctx.db
      .query('kidControls')
      .withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', member._id))
      .unique();
    if (controls) return controls.quietHours;
  }
  const settings = await ctx.db
    .query('settings')
    .withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', member._id))
    .unique();
  return settings?.notify.quietHours ?? { start: '00:00', end: '00:00' };
}

/** How many `push`-delivered notifications this recipient has already received today (their own local
 * day, as of `asOf`) — the input to the daily cap (CONTRACT §2 `settings.notify.dailyCap`). Bounded the
 * same way `today.ts`'s own per-recipient notification reads already are: one family, one member, a day's
 * worth of rows. */
export async function pushSentToday(ctx: Ctx, familyId: Id<'families'>, recipientId: Id<'members'>, tz: string, asOf: number): Promise<number> {
  const today = localDate(asOf, tz);
  const rows = await ctx.db
    .query('notifications')
    .withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', recipientId))
    .collect();
  return rows.filter((n) => n.sentAt !== undefined && localDate(n.sentAt, tz) === today).length;
}

// ---------- dedupe + candidate creation ----------

/** Inserts a new `candidates` row unless one already exists for this `dedupeKey` (CONTRACT §2: "the same
 * thing isn't proposed twice"). `.first()` rather than `.unique()` so a theoretical duplicate never crashes
 * the whole sweep. Returns `null` when a candidate already exists — the caller should treat that as "this
 * trigger was already handled," not an error. */
export async function insertCandidateIfNew(
  ctx: MutationCtx,
  params: {
    familyId: Id<'families'>;
    recipientId: Id<'members'>;
    kind: NotificationKind;
    dedupeKey: string;
    draftText: string;
    window: { from: number; to: number };
    source: CandidateSource;
  },
): Promise<Id<'candidates'> | null> {
  const existing = await ctx.db
    .query('candidates')
    .withIndex('by_family_dedupeKey', (q) => q.eq('familyId', params.familyId).eq('dedupeKey', params.dedupeKey))
    .first();
  if (existing) return null;
  return ctx.db.insert('candidates', {
    familyId: params.familyId,
    recipientId: params.recipientId,
    kind: params.kind,
    dedupeKey: params.dedupeKey,
    draft: { text: params.draftText, buttons: NOTIFICATION_KINDS_CONFIG[params.kind].buttons },
    window: params.window,
    status: 'new',
    source: params.source,
  });
}

/** The MEGA-to-MEGA request trigger (PLAN.md -> Proactive engine trigger source #5). Called synchronously
 * by `agent/tools.ts`'s `ask_member` handler, inside the same mutation that creates the `requests` row —
 * unlike the other triggers, a request's text is already written by the asking member, so there's no draft
 * model call to wait on, and it always forces `delivery: 'push'` (still subject to the kid-eligibility,
 * quiet-hours and daily-cap checks `finalizeCandidateLogic` applies to everything). */
export async function createRequestCandidate(ctx: MutationCtx, params: { familyId: Id<'families'>; recipientId: Id<'members'>; requestId: Id<'requests'>; text: string; now: number }): Promise<void> {
  const candidateId = await ctx.db.insert('candidates', {
    familyId: params.familyId,
    recipientId: params.recipientId,
    kind: 'request',
    dedupeKey: requestDedupeKey(params.requestId),
    draft: { text: params.text, buttons: NOTIFICATION_KINDS_CONFIG.request.buttons },
    window: { from: params.now, to: params.now + PROACTIVE.mattersToWindowMinutes * 60_000 },
    status: 'new',
    source: { kind: 'request', requestId: params.requestId },
  });
  await finalizeCandidateLogic(ctx, { candidateId, kind: 'request', text: params.text, score: 1, reason: 'explicit request from another member', forcedDelivery: 'push' });
}

// ---------- draft + judge (one combined structured model call; see convex/proactive.ts `processCandidate`) ----------

export const DRAFT_JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: [...NOTIFICATION_KINDS] },
    text: { type: 'string' },
    score: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['kind', 'text', 'score', 'reason'],
  additionalProperties: false,
} as const;

export interface DraftContext {
  familyId: Id<'families'>;
  recipientName: string;
  recipientRole: Role;
  megaName: string;
  megaPersonalityBlurb: string;
  source: CandidateSource;
  seedText: string;
  sentTodayCount: number;
  reactionSummary: string;
}

/** Loads everything `buildDraftJudgePrompt` needs for one `status: 'new'` candidate. `null` when the
 * candidate is gone or already past 'new' (another sweep got to it first — the caller should just stop). */
export async function loadDraftContextFor(ctx: Ctx, candidateId: Id<'candidates'>): Promise<DraftContext | null> {
  const candidate = await ctx.db.get(candidateId);
  if (!candidate || candidate.status !== 'new') return null;
  const recipient = await ctx.db.get(candidate.recipientId);
  const family = await ctx.db.get(candidate.familyId);
  if (!recipient || !family) return null;
  const mega = await ctx.db
    .query('megas')
    .withIndex('by_family_owner', (q) => q.eq('familyId', candidate.familyId).eq('ownerId', candidate.recipientId))
    .unique();
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_family_member', (q) => q.eq('familyId', candidate.familyId).eq('memberId', candidate.recipientId))
    .unique();
  const now = await clock.now(ctx, candidate.familyId);
  const sentTodayCount = await pushSentToday(ctx, candidate.familyId, candidate.recipientId, family.timezone, now);
  const reactionSummary = profile
    ? NOTIFICATION_KINDS.map((k) => `${k}: ${reactionSummaryFor(profile.proactive[k])}`).join('; ')
    : 'none yet';

  return {
    familyId: candidate.familyId,
    recipientName: recipient.name,
    recipientRole: recipient.role,
    megaName: mega?.name ?? 'MEGA',
    megaPersonalityBlurb: mega ? PERSONALITIES[mega.personality].blurb : 'calm and helpful',
    source: candidate.source ?? { kind: 'checkin', memberId: candidate.recipientId },
    seedText: candidate.draft.text,
    sentTodayCount,
    reactionSummary,
  };
}

function triggerInstruction(ctxData: DraftContext): { description: string; allowedKinds: readonly NotificationKind[]; fallbackKind: NotificationKind } {
  switch (ctxData.source.kind) {
    case 'reminder':
      return { description: `This is a reminder due around now: "${ctxData.seedText}". "kind" must be "reminder".`, allowedKinds: ['reminder'], fallbackKind: 'reminder' };
    case 'checkin':
      return { description: `Write a short, warm daily check-in greeting for ${ctxData.recipientName}. "kind" must be "update".`, allowedKinds: ['update'], fallbackKind: 'update' };
    case 'mattersTo':
      return {
        description: `Another family member said something that matters to ${ctxData.recipientName}: "${ctxData.seedText}". Decide whether this should be a "request" (asking ${ctxData.recipientName} to do something), a "tip", or an "update", and write it in your own words.`,
        allowedKinds: ['request', 'tip', 'update'],
        fallbackKind: 'tip',
      };
    case 'request':
      // Requests skip this model call entirely (convex/proactive.ts `processCandidate` returns early) — the
      // asking member already wrote the text themselves. Kept exhaustive for type-safety, never reached.
      return { description: '', allowedKinds: ['request'], fallbackKind: 'request' };
  }
}

/** Builds the one combined draft+judge prompt. Combined into a single structured call (rather than two
 * separate ones) deliberately — PLAN.md's two steps are two *jobs*, not necessarily two network round
 * trips, and this build's model budget is tight (task brief: ~15 live calls total). */
export function buildDraftJudgePrompt(ctxData: DraftContext): { system: string; user: string; allowedKinds: readonly NotificationKind[]; fallbackKind: NotificationKind } {
  const trigger = triggerInstruction(ctxData);
  const system = [
    `You are ${ctxData.megaName}, ${ctxData.recipientName}'s AI assistant, deciding whether to proactively message them.`,
    `Personality: ${ctxData.megaPersonalityBlurb}`,
    trigger.description,
    `Write "text" as a short message in your own voice, addressed to ${ctxData.recipientName} directly.`,
    `Then set "score" 0 to 1 for how worth interrupting them this is right now (1 = urgent, interrupt immediately; 0 = not worth bothering them at all). They've already received ${ctxData.sentTodayCount} push notifications today. Recent reactions to this kind of message: ${ctxData.reactionSummary}.`,
    ctxData.recipientRole === 'kid' ? 'This member is a kid — keep the message short, simple and age-appropriate.' : '',
    'Give a one-sentence "reason" for your score.',
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user: ctxData.seedText, allowedKinds: trigger.allowedKinds, fallbackKind: trigger.fallbackKind };
}

export interface DraftJudgeResult {
  kind: NotificationKind;
  text: string;
  score: number;
  reason: string;
}

/** Parses the model's structured reply defensively — a malformed/missing field never throws, it just falls
 * back to something safe (same posture as `agent/writer.ts`'s own JSON parsing). */
export function parseDraftJudgeResult(text: string | null, fallbackKind: NotificationKind, allowedKinds: readonly NotificationKind[]): DraftJudgeResult {
  let parsed: Record<string, unknown> = {};
  try {
    const p = text ? JSON.parse(text) : {};
    if (p && typeof p === 'object') parsed = p as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const kindRaw = typeof parsed.kind === 'string' ? parsed.kind : undefined;
  const kind = kindRaw && (NOTIFICATION_KINDS as readonly string[]).includes(kindRaw) && allowedKinds.includes(kindRaw as NotificationKind) ? (kindRaw as NotificationKind) : fallbackKind;
  const draftText = typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim() : 'Just checking in.';
  const score = typeof parsed.score === 'number' && Number.isFinite(parsed.score) ? Math.max(0, Math.min(1, parsed.score)) : 0;
  const reason = typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : 'no reason given';
  return { kind, text: draftText, score, reason };
}

// ---------- timing + delivery decision ----------

/** Turns a judged (or, for a request, forced) result into a scheduling decision: drop, or deliver as
 * `push`/`statement` at a specific `deliverAt` that already accounts for quiet hours and the window. */
export async function decideDeliveryTiming(
  ctx: Ctx,
  params: { familyId: Id<'families'>; recipient: Doc<'members'>; tz: string; kind: NotificationKind; score: number; window: { from: number; to: number }; now: number; forcedDelivery?: Delivery },
): Promise<{ delivery: Delivery; deliverAt?: number }> {
  const cfg = NOTIFICATION_KINDS_CONFIG[params.kind];
  let delivery: Delivery = params.forcedDelivery ?? (params.score >= cfg.thresholds.push ? 'push' : params.score >= cfg.thresholds.widget ? 'statement' : 'drop');

  if (params.recipient.role === 'kid' && !cfg.kidsGetIt) delivery = 'drop';
  if (delivery === 'drop') return { delivery };

  // Quiet hours always win over the window (PLAN.md's push section: "held until quiet hours end," never
  // "delivered anyway because the window was about to close") — a delayed, still-useful message beats one
  // that buzzed a sleeping phone. The window only clamps the *lower* bound here; its upper bound is a
  // preference the draft/judge step already baked into `score`, not a hard deadline enforced below.
  const quiet = await quietHoursForMember(ctx, params.familyId, params.recipient);
  const desired = Math.max(params.now, params.window.from);
  const deliverAt = quietHoursAdjust(desired, params.tz, quiet);

  if (delivery === 'push') {
    const settings = await ctx.db
      .query('settings')
      .withIndex('by_family_member', (q) => q.eq('familyId', params.familyId).eq('memberId', params.recipient._id))
      .unique();
    const dailyCap = settings?.notify.dailyCap ?? Infinity;
    const sentToday = await pushSentToday(ctx, params.familyId, params.recipient._id, params.tz, deliverAt);
    if (sentToday >= dailyCap) delivery = 'statement';
  }

  return { delivery, deliverAt };
}

// ---------- re-check at delivery time ----------

/** PLAN.md -> Proactive engine step 5: "at fire time, check again that it still applies." */
export async function candidateStillApplies(ctx: Ctx, source: CandidateSource | undefined): Promise<boolean> {
  if (!source) return true;
  switch (source.kind) {
    case 'reminder': {
      const r = await ctx.db.get(source.reminderId);
      return !!r && !r.done;
    }
    case 'request': {
      const r = await ctx.db.get(source.requestId);
      return !!r && r.status === 'open';
    }
    case 'checkin':
    case 'mattersTo':
      return true;
  }
}

// ---------- push payload assembly ----------

// `Record<Loudness, ...>` makes TS enforce every Loudness value is covered — no separate exhaustiveness
// check needed.
const LOUDNESS_TO_INTERRUPTION: Record<Loudness, PushMessage['interruptionLevel']> = {
  timeSensitive: 'time-sensitive',
  active: 'active',
  passive: 'passive',
};

export function interruptionLevelFor(loudness: Loudness): PushMessage['interruptionLevel'] {
  return LOUDNESS_TO_INTERRUPTION[loudness];
}

export function androidChannelFor(kind: NotificationKind): string {
  return ANDROID_CHANNELS[NOTIFICATION_KINDS_CONFIG[kind].channel];
}

/** Pure: one `PushMessage` per registered token. No `ctx` — `fetch` (inside `PushSender.send`) can only
 * happen in an action, so `convex/proactive.ts`'s `sendPush` action loads this data via `ctx.runQuery`
 * (`loadPushContext`), builds the messages here, then calls `getPushSender().send(...)` itself; pruning a
 * dead token afterward is a separate `ctx.runMutation`. Nothing here touches the database. */
export function buildPushMessages(
  notification: { _id: Id<'notifications'>; kind: NotificationKind; body: string; buttons: { id: string }[]; loudness: Loudness },
  megaName: string,
  threadId: Id<'threads'>,
  messageId: Id<'messages'>,
  tokens: { token: string; platform: Doc<'settings'>['pushTokens'][number]['platform'] }[],
  /** '' when `PUSH_ANSWER_SECRET` isn't configured on this deployment yet (`loadPushContext`'s fallback) —
   * omitted from the payload entirely rather than sent as an empty string. */
  answerToken: string,
): PushMessage[] {
  return tokens.map((t) => ({
    token: t.token,
    platform: t.platform,
    title: megaName,
    body: notification.body,
    // CONTRACT §5 v0.11: `answerToken` lets the killed-app background notification-response task (no
    // signed-in session) answer via `POST /push/answer` (convex/http.ts, convex/model/pushAnswerToken.ts).
    data: { v: 1, notificationId: notification._id, kind: notification.kind, threadId, messageId, answerToken: answerToken || undefined },
    categoryId: notification.buttons.length ? NOTIFICATION_KINDS_CONFIG[notification.kind].buttons : undefined,
    channelId: androidChannelFor(notification.kind),
    interruptionLevel: interruptionLevelFor(notification.loudness),
  }));
}

// ---------- profile reaction counts (PLAN.md -> Proactive engine "feedback that tunes future messages") ----------

export async function bumpProfileCount(ctx: MutationCtx, familyId: Id<'families'>, memberId: Id<'members'>, kind: NotificationKind, field: 'sent' | 'answered' | 'ignored' | 'up' | 'down'): Promise<void> {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', memberId))
    .unique();
  if (!profile) return;
  const counts = profile.proactive[kind];
  await ctx.db.patch(profile._id, { proactive: { ...profile.proactive, [kind]: { ...counts, [field]: counts[field] + 1 } } });
}

/** A short, model-readable summary of recent feedback for this kind, for the draft+judge prompt. */
export function reactionSummaryFor(counts: { sent: number; answered: number; up: number; down: number }): string {
  if (counts.sent === 0) return 'none yet';
  return `${counts.sent} sent, ${counts.answered} answered, ${counts.up} thumbs up, ${counts.down} thumbs down`;
}

// ---------- deliver (re-check -> notification + thread mirror; push itself is sent by an action) ----------

/** The real implementation behind `internal.proactive.deliverCandidate` — also called directly by
 * `tickFamilyLogic`'s sweep (a mutation can't `ctx.runMutation` another registered mutation; this is the
 * same pattern `agent/tools.ts`'s `dispatchTool` uses). Idempotent: a candidate not in `status: 'scheduled'`
 * is a no-op, so firing it twice (a real scheduled callback racing a simulated-clock sweep) never double-
 * delivers. */
export async function deliverCandidateLogic(ctx: MutationCtx, candidateId: Id<'candidates'>): Promise<void> {
  const candidate = await ctx.db.get(candidateId);
  if (!candidate || candidate.status !== 'scheduled') return;

  if (!(await candidateStillApplies(ctx, candidate.source))) {
    await ctx.db.patch(candidate._id, { status: 'cancelled' });
    return;
  }

  const recipient = await ctx.db.get(candidate.recipientId);
  const mega = await ctx.db
    .query('megas')
    .withIndex('by_family_owner', (q) => q.eq('familyId', candidate.familyId).eq('ownerId', candidate.recipientId))
    .unique();
  if (!recipient || !mega) {
    await ctx.db.patch(candidate._id, { status: 'cancelled' });
    return;
  }
  const now = await clock.now(ctx, candidate.familyId);
  const cfg = NOTIFICATION_KINDS_CONFIG[candidate.kind];

  if (candidate.delivery === 'statement') {
    // today.get / widgets.timeline already read 'delivered' + delivery:'statement' candidates directly
    // (convex/model/home.ts `topStatementCandidate`) — nothing else to create.
    await ctx.db.patch(candidate._id, { status: 'delivered' });
    await bumpProfileCount(ctx, candidate.familyId, candidate.recipientId, candidate.kind, 'sent');
    return;
  }

  // delivery === 'push'
  const notificationId = await ctx.db.insert('notifications', {
    familyId: candidate.familyId,
    recipientId: candidate.recipientId,
    candidateId: candidate._id,
    kind: candidate.kind,
    loudness: cfg.loudness,
    title: mega.name,
    body: candidate.draft.text,
    megaId: mega._id,
    buttons: [...BUTTON_SETS[candidate.draft.buttons]],
    reminderId: candidate.source?.kind === 'reminder' ? candidate.source.reminderId : undefined,
    requestId: candidate.source?.kind === 'request' ? candidate.source.requestId : undefined,
    sentAt: now,
  });

  const thread = await getOrCreateOwnThread(ctx, candidate.familyId, candidate.recipientId, mega._id, now);
  const messageId = await ctx.db.insert('messages', {
    familyId: candidate.familyId,
    threadId: thread._id,
    at: now,
    author: { kind: 'mega', id: mega._id },
    via: 'text',
    body: { type: 'card', card: { kind: 'notification', notificationId } },
    chips: [],
    fromNotificationId: notificationId,
  });
  await ctx.db.patch(notificationId, { messageId });
  await ctx.db.patch(thread._id, { lastAt: now });
  if (candidate.source?.kind === 'request') await ctx.db.patch(candidate.source.requestId, { notificationId });

  await ctx.db.patch(candidate._id, { status: 'delivered' });
  await bumpProfileCount(ctx, candidate.familyId, candidate.recipientId, candidate.kind, 'sent');

  await ctx.scheduler.runAfter(0, internal.proactive.sendPush, { notificationId });
}

/** The real implementation behind `internal.proactive.finalizeCandidate`. */
export async function finalizeCandidateLogic(
  ctx: MutationCtx,
  params: { candidateId: Id<'candidates'>; kind: NotificationKind; text: string; score: number; reason: string; forcedDelivery?: Delivery },
): Promise<void> {
  const candidate = await ctx.db.get(params.candidateId);
  if (!candidate || candidate.status !== 'new') return; // already processed/superseded — idempotent

  const recipient = await ctx.db.get(candidate.recipientId);
  const family = await ctx.db.get(candidate.familyId);
  if (!recipient || !family) {
    await ctx.db.patch(candidate._id, { status: 'dropped', reason: 'recipient or family not found' });
    return;
  }
  const now = await clock.now(ctx, candidate.familyId);
  const cfg = NOTIFICATION_KINDS_CONFIG[params.kind];
  // Defense in depth: `params.score` arrives pre-clamped from `parseDraftJudgeResult` (model output) or a
  // literal `1` (the request trigger), but this is still a judgment value that feeds a threshold decision,
  // never trusted un-bounded — clamp again here, the one place that decision actually happens.
  const score = Number.isFinite(params.score) ? Math.max(0, Math.min(1, params.score)) : 0;

  const { delivery, deliverAt } = await decideDeliveryTiming(ctx, {
    familyId: candidate.familyId,
    recipient,
    tz: family.timezone,
    kind: params.kind,
    score,
    window: candidate.window,
    now,
    forcedDelivery: params.forcedDelivery,
  });

  if (delivery === 'drop' || deliverAt === undefined) {
    await ctx.db.patch(candidate._id, {
      status: 'dropped',
      kind: params.kind,
      draft: { text: params.text, buttons: cfg.buttons },
      score,
      reason: params.reason,
      delivery: 'drop',
    });
    return;
  }

  const scheduledId = await ctx.scheduler.runAt(deliverAt, internal.proactive.deliverCandidate, { candidateId: candidate._id });
  await ctx.db.patch(candidate._id, {
    status: 'scheduled',
    kind: params.kind,
    draft: { text: params.text, buttons: cfg.buttons },
    score,
    reason: params.reason,
    delivery,
    deliverAt,
    scheduledId,
  });
}

// ---------- triggers: reminders, cross-member "matters to", daily check-in ----------

async function scanReminderTriggers(ctx: MutationCtx, familyId: Id<'families'>, now: number): Promise<void> {
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', familyId))
    .collect();
  for (const member of members) {
    const due = await ctx.db
      .query('reminders')
      .withIndex('by_family_member_due', (q) => q.eq('familyId', familyId).eq('forMemberId', member._id).lte('dueAt', now))
      .collect();
    for (const reminder of due) {
      if (reminder.done) continue;
      const candidateId = await insertCandidateIfNew(ctx, {
        familyId,
        recipientId: member._id,
        kind: 'reminder',
        dedupeKey: reminderDedupeKey(reminder._id),
        draftText: reminder.text,
        window: { from: reminder.dueAt, to: reminder.dueAt + PROACTIVE.reminderGraceMinutes * 60_000 },
        source: { kind: 'reminder', reminderId: reminder._id },
      });
      if (candidateId) await ctx.scheduler.runAfter(0, internal.proactive.processCandidate, { candidateId });
    }
  }
}

/** Cross-member trigger (PLAN.md -> Proactive engine: "the memory writer marks 'matters to Teal'"). Reads
 * unprocessed `familyEvents` (`processed.triggers === false`, `type: 'said'`, `payload.mattersToMemberId`
 * set by `agent/writer.ts`). Scoped to one family already (hackathon scale — see `model/spend.ts`'s
 * documented precedent for this same "small family, bounded collect" trade-off); every row is marked
 * processed immediately so the backlog can't grow across sweeps. */
async function scanFamilyEventTriggers(ctx: MutationCtx, familyId: Id<'families'>, now: number): Promise<void> {
  const rows = await ctx.db
    .query('familyEvents')
    .withIndex('by_family_at', (q) => q.eq('familyId', familyId))
    .collect();
  for (const row of rows) {
    if (row.processed.triggers || row.type !== 'said') continue;
    const payload = row.payload as { mattersToMemberId?: string; fromMemberId?: string; text?: string } | undefined;
    if (!payload?.mattersToMemberId || !payload.text) {
      await ctx.db.patch(row._id, { processed: { ...row.processed, triggers: true } });
      continue;
    }
    let recipient: Doc<'members'> | null = null;
    try {
      recipient = await ctx.db.get(payload.mattersToMemberId as Id<'members'>);
    } catch {
      recipient = null;
    }
    if (!recipient || recipient.familyId !== familyId) {
      await ctx.db.patch(row._id, { processed: { ...row.processed, triggers: true } });
      continue;
    }
    const candidateId = await insertCandidateIfNew(ctx, {
      familyId,
      recipientId: recipient._id,
      kind: 'tip', // placeholder — the draft+judge call picks the real kind (request/tip/update)
      dedupeKey: mattersToDedupeKey(row._id),
      draftText: payload.text,
      window: { from: now, to: now + PROACTIVE.mattersToWindowMinutes * 60_000 },
      source: { kind: 'mattersTo', fromMemberId: (payload.fromMemberId as Id<'members'>) ?? recipient._id, familyEventId: row._id },
    });
    if (candidateId) await ctx.scheduler.runAfter(0, internal.proactive.processCandidate, { candidateId });
    await ctx.db.patch(row._id, { processed: { ...row.processed, triggers: true } });
  }
}

/** Daily check-in greeting (PLAN.md -> Proactive engine "check-ins"). Kids are skipped up front — per
 * `NOTIFICATION_KINDS_CONFIG.update.kidsGetIt === false` they'd always be dropped downstream anyway, and
 * this trigger recurs every single day, so skipping it here avoids a wasted model call on a predictable,
 * recurring case (unlike the one-off `mattersTo` trigger, where pre-filtering isn't worth the complexity). */
async function scanCheckInTriggers(ctx: MutationCtx, familyId: Id<'families'>, now: number): Promise<void> {
  const family = await ctx.db.get(familyId);
  if (!family) return;
  const tz = family.timezone;
  const today = localDate(now, tz);
  const [h, m] = PROACTIVE.checkIn.time.split(':').map(Number);
  const checkInInstant = zonedInstant(today, h * 60 + m, tz);
  if (now < checkInInstant) return;

  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', familyId))
    .collect();
  for (const member of members) {
    if (member.role === 'kid' || !member.authId) continue; // no push-worthy greeting for kids or logins-less members (e.g. the toddler)
    const candidateId = await insertCandidateIfNew(ctx, {
      familyId,
      recipientId: member._id,
      kind: 'update',
      dedupeKey: checkinDedupeKey(member._id, today),
      draftText: `Good morning, ${member.name}!`,
      window: { from: checkInInstant, to: checkInInstant + PROACTIVE.checkIn.windowMinutes * 60_000 },
      source: { kind: 'checkin', memberId: member._id },
    });
    if (candidateId) await ctx.scheduler.runAfter(0, internal.proactive.processCandidate, { candidateId });
  }
}

/** Releases notifications a recipient's quiet hours were holding back (seed.ts's held kid reminder; the
 * mechanism PLAN.md's push section calls "held until quiet hours end"). This is the one piece of `clock.
 * jump`'s original inline logic — now shared with the production cron via `tickFamilyLogic` below. */
async function releaseHeldNotifications(ctx: MutationCtx, familyId: Id<'families'>, now: number): Promise<void> {
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', familyId))
    .collect();
  for (const member of members) {
    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', member._id))
      .collect();
    for (const n of rows) {
      if (n.sentAt === undefined && n.heldUntil !== undefined && n.heldUntil <= now) {
        await ctx.db.patch(n._id, { sentAt: now });
        await ctx.scheduler.runAfter(0, internal.proactive.sendPush, { notificationId: n._id });
      }
    }
  }
}

/** Fires any `scheduled` candidate whose `deliverAt` has already passed. Needed because the simulated
 * demo clock (`clock.jump`) can leap `now` far past a candidate's real-wall-clock `ctx.scheduler.runAt`
 * callback without that callback actually having fired yet (Convex schedules against real time; the
 * family's *simulated* time is a separate, server-side offset — see `ports/clock.ts`). Cancels the
 * original scheduled call first so it can't also fire later and double-deliver. */
async function fireDueScheduledCandidates(ctx: MutationCtx, familyId: Id<'families'>, now: number): Promise<void> {
  const scheduled = await ctx.db
    .query('candidates')
    .withIndex('by_family_status', (q) => q.eq('familyId', familyId).eq('status', 'scheduled'))
    .collect();
  for (const c of scheduled) {
    if (c.deliverAt !== undefined && c.deliverAt <= now) {
      if (c.scheduledId) await ctx.scheduler.cancel(c.scheduledId);
      await deliverCandidateLogic(ctx, c._id);
    }
  }
}

/** The one per-family "tick": releases held notifications, fires any candidate whose time has come, then
 * scans every trigger source for new candidates. Called identically by `clock.jump` (CONTRACT §4: "fires
 * due jobs through the same code") and by the production cron (`convex/crons.ts`) — the only difference is
 * which one provides `now` and how often it's called. */
export async function tickFamilyLogic(ctx: MutationCtx, familyId: Id<'families'>): Promise<void> {
  const now = await clock.now(ctx, familyId);
  await releaseHeldNotifications(ctx, familyId, now);
  await fireDueScheduledCandidates(ctx, familyId, now);
  await scanReminderTriggers(ctx, familyId, now);
  await scanFamilyEventTriggers(ctx, familyId, now);
  await scanCheckInTriggers(ctx, familyId, now);
}
