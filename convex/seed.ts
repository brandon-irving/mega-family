// Seeds the sample family (CONTRACT §10) so every screen has data from day 1. Internal only.
//
// Re-seeding (STATUS.md): re-running `sampleFamily` while an earlier sample family still exists creates a
// SECOND family whose members reuse the exact same `sample:<key>` authId strings as the first one's — so
// any lookup by `members.by_authId` (sign-in, `demo.signInAs`) finds two rows and throws on `.unique()`.
// `resetSampleFamily` is the fix: it deletes every row belonging to the existing sample family (by name —
// `DEMO.sampleFamilyName`) across every family-owned table, then rebuilds a fresh one, and finally
// reapplies whatever REAL authId each sample member had been linked to (via `demo.signInAs`, which
// overwrites a member's placeholder `sample:<key>` authId with the signed-in caller's own) — so anyone
// already "signed in as Admin" (etc.) when the reset runs stays signed in as Admin afterward, matched by
// member name (the one field `demo.signInAs` never changes). Gated by `DEMO_MODE`, same posture as
// `clock.jump` — this is destructive and has no business running against anything but a demo deployment.
import { v } from 'convex/values';
import { DEMO, DRAFT_SANITIZE, KID_SAFETY, LIMITS, NOTIFICATION_KINDS_CONFIG, PROACTIVE, ROOM_DEFAULTS, reminderDedupeKey, requestDedupeKey } from '../shared/config';
import { BUTTON_SETS } from '../shared/config/notifications';
import { SAMPLE_FAMILY as S, type SampleKey } from '../shared/fixtures/sampleFamily';
import { addDays, dayOfWeek, localDate, zonedInstant } from '../shared/time';
import type { Id, TableNames } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { sanitizeDraftText } from './model/proactive';
import { scopeKey } from './model/scopes';

const emptyCounts = { sent: 0, answered: 0, ignored: 0, up: 0, down: 0 };

/** Every family-owned table (schema.ts: "every row ... has familyId"), paired with the index whose first
 * field is `familyId` (every family-owned table has one — schema.ts's own comment on each index) — so a
 * reset deletes exactly this family's rows via an index lookup, never an unindexed full-table scan. Kept
 * as an explicit map (not derived from `TABLES`) so adding a new table is a deliberate one-line addition
 * here too, not an accidental omission. */
const FAMILY_OWNED_TABLES: readonly [TableNames, string][] = [
  ['members', 'by_family'],
  ['relationships', 'by_family_from'],
  ['megas', 'by_family_owner'],
  ['invites', 'by_family_member'],
  ['grants', 'by_family_owner'],
  ['sharing', 'by_family_member'],
  ['kidControls', 'by_family_member'],
  ['settings', 'by_family_member'],
  ['threads', 'by_family_owner'],
  ['messages', 'by_family_thread_at'],
  ['memories', 'by_family_scopeKey'],
  ['profiles', 'by_family_member'],
  ['events', 'by_family_start'],
  ['reminders', 'by_family_member_due'],
  ['lists', 'by_family'],
  ['listItems', 'by_family_list'],
  ['familyEvents', 'by_family_at'],
  ['candidates', 'by_family_dedupeKey'],
  ['notifications', 'by_family_recipient'],
  ['requests', 'by_family_to'],
  ['rooms', 'by_family_owner'],
  ['images', 'by_family'],
  ['integrations', 'by_family'],
  ['usage', 'by_family_day'],
  ['clocks', 'by_family'],
];

async function deleteFamilyCompletely(ctx: MutationCtx, familyId: Id<'families'>): Promise<void> {
  for (const [table, indexName] of FAMILY_OWNED_TABLES) {
    const rows = await ctx.db
      .query(table)
      .withIndex(indexName as never, (q: any) => q.eq('familyId', familyId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
  await ctx.db.delete(familyId);
}

async function createSampleFamily(ctx: MutationCtx, weekOf: string | undefined): Promise<{ familyId: Id<'families'>; members: Record<SampleKey, Id<'members'>> }> {
    const realNow = Date.now(); // the one allowed real-clock read: it anchors the demo clock (clocks.offsetMs)
    const tz = S.timezone;
    const today = localDate(realNow, tz);
    const sunday = weekOf ?? addDays(today, -dayOfWeek(today));
    const at = (day: number, minutes: number) => zonedInstant(addDays(sunday, day), minutes, tz);
    const demoNow = at(S.start.day, S.start.minutes);

    const familyId = await ctx.db.insert('families', { name: S.name, timezone: tz, parentCode: S.parentCode, createdAt: demoNow });

    // members
    const m = {} as Record<SampleKey, Id<'members'>>;
    for (const x of S.members) {
      m[x.key] = await ctx.db.insert('members', {
        familyId,
        name: x.name,
        role: x.role,
        authId: x.login ? `sample:${x.key}` : undefined,
        grade: x.grade,
        activities: x.activities,
        hasMega: true,
        joinedAt: x.login ? demoNow : undefined,
      });
    }
    await ctx.db.patch(familyId, { adminId: m.admin });
    for (const [from, to, kind] of S.relationships) await ctx.db.insert('relationships', { familyId, from: m[from], to: m[to], kind });

    // MEGAs
    const mega = {} as Record<SampleKey | 'family', Id<'megas'>>;
    for (const x of S.megas) {
      mega[x.owner ?? 'family'] = await ctx.db.insert('megas', {
        familyId,
        kind: x.kind,
        ownerId: x.owner ? m[x.owner] : undefined,
        name: x.name,
        look: { hex: x.hex, sticker: x.sticker },
        personality: x.personality,
        job: { station: 'charger', label: 'Resting', busy: false, since: demoNow },
      });
    }

    // per-member settings, sharing, kid controls, profiles, threads
    const thread = {} as Record<SampleKey, Id<'threads'>>;
    for (const x of S.members) {
      const isKid = x.role === 'kid';
      const quiet = isKid ? LIMITS.quietHours.kid : LIMITS.quietHours.adult;
      await ctx.db.insert('settings', {
        familyId,
        memberId: m[x.key],
        theme: 'midnight',
        accent: x.role === 'admin' ? 'theme' : 'mega',
        wallpaper: null,
        notify: {
          loudKinds: isKid ? ['reminder'] : ['reminder', 'request'],
          quietHours: quiet,
          dailyCap: isKid ? LIMITS.push.dailyCapKid : LIMITS.push.dailyCapAdult,
        },
        pushTokens: [],
      });
      if (isKid) {
        const d = KID_SAFETY.defaults;
        await ctx.db.insert('kidControls', {
          familyId,
          memberId: m[x.key],
          homeworkMode: d.homeworkMode,
          quietHours: quiet,
          dailyMinutes: d.dailyMinutes,
          blockedTopics: [],
          tellsParents: { ...d.tellsParents },
          parentsCanReadChat: d.parentsCanReadChat,
          webSearch: d.webSearch,
        });
      } else {
        await ctx.db.insert('sharing', { familyId, memberId: m[x.key], schedule: 'family', lists: 'family', hqActivity: 'family' });
      }
      await ctx.db.insert('profiles', {
        familyId,
        memberId: m[x.key],
        callMe: x.name,
        basics: x.grade ? { grade: x.grade } : {},
        routines: [],
        places: [],
        proactive: { reminder: { ...emptyCounts }, request: { ...emptyCounts }, tip: { ...emptyCounts }, update: { ...emptyCounts } },
        checkQuestions: [],
      });
      // members without a login (the toddler) have no chat thread
      if (x.login) thread[x.key] = await ctx.db.insert('threads', { familyId, ownerId: m[x.key], megaIds: [mega[x.key]], lastAt: demoNow });
    }

    // a short conversation in the admin's thread
    await message(ctx, familyId, thread.admin, demoNow - 30 * 60_000, { kind: 'mega', id: mega.admin }, { type: 'text', text: 'Good afternoon! Soccer pickup is at 4:50.' });

    // events
    const everyone = S.members.map((x) => x.key);
    for (const [day, minutes, title, who] of S.events) {
      const people = who === 'all' ? everyone : who;
      await ctx.db.insert('events', {
        familyId,
        title,
        start: at(day, minutes),
        who: people.map((k) => m[k]),
        source: 'mega',
        createdBy: m.admin,
        scope: 'family',
        cancelled: false,
      });
    }

    // lists
    for (const l of S.lists) {
      const listId = await ctx.db.insert('lists', { familyId, name: l.name, scope: l.scope });
      for (const text of l.items) await ctx.db.insert('listItems', { familyId, listId, text, checked: false, addedBy: m.admin, at: demoNow });
    }

    // memories in every scope
    for (const x of S.memories) {
      let key: string;
      if (x.scope === 'personal') key = scopeKey(familyId, { scope: 'personal', memberId: m[x.owner!] });
      else if (x.scope === 'shared') {
        const grantId = await ctx.db.insert('grants', { familyId, ownerId: m[x.owner!], granteeIds: (x.grantees ?? []).map((k) => m[k]), label: x.text });
        key = scopeKey(familyId, { scope: 'shared', grantId });
      } else key = scopeKey(familyId, { scope: x.scope });
      await ctx.db.insert('memories', {
        familyId,
        scope: x.scope,
        scopeKey: key,
        about: x.about.map((k) => m[k]),
        kind: x.kind,
        text: x.text,
        source: { kind: 'onboarding' },
        trigger: 'explicit',
        confidence: 1,
        confirmed: true,
        sensitive: false,
        pinned: x.pinned,
        createdAt: demoNow,
        lastUsedAt: demoNow,
      });
    }

    // the open milk request, with its push to the admin. onAccept (G3): tapping "Yes" doesn't just record
    // an answer, it actually adds milk to Groceries (PLAN.md -> Proactive engine step 6) — the same
    // demo-able effect a live ask_member call gets via convex/model/proactive.ts `createRequestCandidate`.
    const req = S.request;
    const requestCfg = NOTIFICATION_KINDS_CONFIG.request;
    // UX6: a request's notification title is its own headline (what it's asking), never the MEGA's name —
    // same sanitize pass `createRequestCandidate` applies to a live `ask_member` call.
    const requestTitle = sanitizeDraftText(req.text, 'request', DRAFT_SANITIZE.maxTitleLength);
    const requestId = await ctx.db.insert('requests', { familyId, fromMemberId: m[req.from], toMemberId: m[req.to], text: req.text, status: 'open', onAccept: { tool: 'lists_add', listName: 'Groceries', text: 'Milk' } });
    const requestCandidateId = await ctx.db.insert('candidates', {
      familyId,
      recipientId: m[req.to],
      kind: 'request',
      dedupeKey: requestDedupeKey(requestId),
      draft: { text: req.text, title: requestTitle, buttons: requestCfg.buttons },
      score: 1,
      reason: 'seed: explicit request from another member',
      delivery: 'push',
      window: { from: demoNow - 5 * 60_000, to: demoNow + PROACTIVE.mattersToWindowMinutes * 60_000 },
      deliverAt: demoNow - 5 * 60_000,
      status: 'delivered',
      source: { kind: 'request', requestId },
    });
    const notificationId = await ctx.db.insert('notifications', {
      familyId,
      recipientId: m[req.to],
      candidateId: requestCandidateId,
      kind: 'request',
      loudness: requestCfg.loudness,
      title: requestTitle,
      body: req.text,
      megaId: mega[req.to],
      buttons: [...BUTTON_SETS[requestCfg.buttons]],
      requestId,
      sentAt: demoNow - 5 * 60_000,
    });
    const messageId = await message(ctx, familyId, thread[req.to], demoNow - 5 * 60_000, { kind: 'mega', id: mega[req.to] }, { type: 'card', card: { kind: 'notification', notificationId } }, notificationId);
    await ctx.db.patch(notificationId, { messageId });
    await ctx.db.patch(requestId, { notificationId });

    // a kid reminder held by quiet hours. C2 (BLOCKER, G3 correctness review): this used to hand-build a
    // standalone, candidate-less "orphan" notification with `heldUntil` set directly — but the REAL
    // pipeline (convex/model/proactive.ts `scanReminderTriggers`) only knows a reminder has already been
    // handled by checking for an existing `candidates` row (by dedupeKey) or an existing `notifications`
    // row (by `reminderId`). An orphan notification satisfied neither check well enough on its own under
    // every path (and satisfied NEITHER before this fix), so once the demo clock jumped past quiet hours,
    // the sweep "discovered" the same due reminder fresh and created a SECOND notification — the double-
    // notify bug. Seeding the same `candidates` + `notifications` shape the real pipeline produces (a
    // `status: 'scheduled'` candidate with `deliverAt` at quiet-hours-end, and a notification that already
    // links back to it via `candidateId`) means `scanReminderTriggers`'s own dedupe/already-handled checks
    // correctly recognize this reminder as already spoken for, and `fireDueScheduledCandidates` (the same
    // code a real scheduled push goes through) delivers it exactly once when the clock passes `deliverAt`.
    const h = S.heldReminder;
    const dueAt = at(h.day, h.minutes);
    const reminderCfg = NOTIFICATION_KINDS_CONFIG.reminder;
    const reminderId = await ctx.db.insert('reminders', { familyId, forMemberId: m[h.for], text: h.text, dueAt, done: false, createdBy: m.admin });
    const [qh, qm] = LIMITS.quietHours.kid.end.split(':').map(Number);
    const heldUntil = at(h.day + 1, qh * 60 + qm);
    const heldReminderTitle = sanitizeDraftText(h.text, 'reminder', DRAFT_SANITIZE.maxTitleLength);
    // status: 'delivered' (not 'scheduled') — this candidate's outcome is already decided and its
    // notification already exists below, same as a real candidate right after `deliverCandidateLogic`
    // runs; it just happens to still be HELD (the notification's own `heldUntil`, released by
    // `releaseHeldNotifications`). A 'scheduled' status here would make `fireDueScheduledCandidates`
    // ALSO try to deliver it once `deliverAt` passes — creating a second, real double-notify bug through
    // a different door than the one this fix closes. The dedupeKey is what matters for
    // `reminderAlreadyHandled`'s skip-check; it doesn't care about status.
    const heldReminderCandidateId = await ctx.db.insert('candidates', {
      familyId,
      recipientId: m[h.for],
      kind: 'reminder',
      dedupeKey: reminderDedupeKey(reminderId),
      draft: { text: h.text, title: heldReminderTitle, buttons: reminderCfg.buttons },
      score: 0.9,
      reason: 'seed: kid reminder held past quiet hours',
      delivery: 'push',
      window: { from: dueAt, to: dueAt + PROACTIVE.reminderGraceMinutes * 60_000 },
      deliverAt: heldUntil,
      status: 'delivered',
      source: { kind: 'reminder', reminderId },
    });
    await ctx.db.insert('notifications', {
      familyId,
      recipientId: m[h.for],
      candidateId: heldReminderCandidateId,
      kind: 'reminder',
      loudness: reminderCfg.loudness,
      title: heldReminderTitle,
      body: h.text,
      megaId: mega[h.for],
      buttons: [...BUTTON_SETS[reminderCfg.buttons]],
      reminderId,
      heldUntil,
    });

    // the admin's MEGA statement for the widget
    await ctx.db.insert('candidates', {
      familyId,
      recipientId: m[S.statement.for],
      kind: 'tip',
      dedupeKey: 'sample:recycling-reminder-offer',
      draft: { text: S.statement.text, buttons: 'tip.default' },
      score: 0.55,
      reason: 'Useful but not worth interrupting for',
      delivery: 'statement',
      window: { from: demoNow, to: at(2, 12 * 60) },
      status: 'delivered',
    });

    // rooms: HQ plus one per member (furniture comes from the room config in G5)
    await ctx.db.insert('rooms', { familyId, ...ROOM_DEFAULTS.hq, furniture: [] });
    for (const x of S.members) await ctx.db.insert('rooms', { familyId, ownerId: m[x.key], ...ROOM_DEFAULTS.member, furniture: [] });

    // the demo clock starts at the mockups' Sunday afternoon
    await ctx.db.insert('clocks', { familyId, mode: 'simulated', offsetMs: demoNow - realNow });

    return { familyId, members: m };
}

export const sampleFamily = internalMutation({
  args: { weekOf: v.optional(v.string()) },
  returns: v.object({ familyId: v.id('families'), members: v.record(v.string(), v.id('members')) }),
  handler: async (ctx, args) => createSampleFamily(ctx, args.weekOf),
});

/** Deletes any existing sample family (matched by name — `SAMPLE_FAMILY.name`, there's only ever meant to
 * be one on a demo deployment) and seeds a fresh one in its place, reapplying whichever REAL authId each
 * sample member had been linked to (via `demo.signInAs`) so a currently-signed-in demo session doesn't get
 * silently logged out of its persona by the reset. See this file's header comment for why re-seeding needs
 * this at all (`sampleFamily` alone collides `members.by_authId`). `DEMO_MODE`-gated, same as `clock.jump`
 * — an internal function, so this is defense in depth (it's never reachable from the client either way),
 * not the only thing stopping a production deployment from wiping real family data. */
export const resetSampleFamily = internalMutation({
  args: { weekOf: v.optional(v.string()) },
  returns: v.object({ familyId: v.id('families'), members: v.record(v.string(), v.id('members')) }),
  handler: async (ctx, args) => {
    if (process.env[DEMO.envVar] !== 'true') throw new Error(`resetSampleFamily refuses to run unless ${DEMO.envVar}=true on this deployment`);

    // `families` has no index on `name` (nothing else ever needs to look a family up that way); bounded
    // the same "hackathon scale" way `convex/proactive.ts` `tickAllFamilies` reads every family — a demo
    // deployment has a handful of rows here, never a real production family count.
    const allFamilies = await ctx.db.query('families').take(1000);
    const existing = allFamilies.filter((f) => f.name === S.name);

    // Capture (name -> authId) before deleting, for every existing sample family — `demo.signInAs`
    // overwrites a member's placeholder `sample:<key>` authId with whoever is currently playing that
    // persona, so this is the one thing worth carrying forward across the reset.
    const authIdByName = new Map<string, string>();
    for (const family of existing) {
      const members = await ctx.db
        .query('members')
        .withIndex('by_family', (q) => q.eq('familyId', family._id))
        .collect();
      for (const member of members) if (member.authId) authIdByName.set(member.name, member.authId);
    }

    for (const family of existing) await deleteFamilyCompletely(ctx, family._id);

    const created = await createSampleFamily(ctx, args.weekOf);
    for (const x of S.members) {
      const carriedAuthId = authIdByName.get(x.name);
      if (carriedAuthId && carriedAuthId !== `sample:${x.key}`) {
        await ctx.db.patch(created.members[x.key], { authId: carriedAuthId, joinedAt: Date.now() });
      }
    }
    return created;
  },
});

async function message(
  ctx: MutationCtx,
  familyId: Id<'families'>,
  threadId: Id<'threads'>,
  at: number,
  author: { kind: 'mega'; id: Id<'megas'> },
  body: { type: 'text'; text: string } | { type: 'card'; card: { kind: 'notification'; notificationId: Id<'notifications'> } },
  fromNotificationId?: Id<'notifications'>,
) {
  return ctx.db.insert('messages', { familyId, threadId, at, author, via: 'text', body, chips: [], fromNotificationId });
}
