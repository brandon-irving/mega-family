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
import { internal } from './_generated/api';
import { internalAction, internalMutation, type MutationCtx } from './_generated/server';
import { sanitizeDraftText } from './model/proactive';
import { seedGd } from './model/seedGd';
import { seedG4 } from './model/seedG4';
import { seedG4b } from './model/seedG4b';
import { seedG5 } from './model/seedG5';
import { realAdaptersOn } from './adapters/registry';
import { FRACTIONS_SHEET } from '../shared/fixtures/homework/fractionsSheet';
import { scopeKey } from './model/scopes';
import { randomToken } from './model/random';
import { clock } from './ports/clock';
import { COLORS } from '../shared/config/looks';
import { LINKS } from '../shared/domain/api';

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
  ['ideas', 'by_family_owner_at'],
  ['familyEvents', 'by_family_at'],
  ['candidates', 'by_family_dedupeKey'],
  ['notifications', 'by_family_recipient'],
  ['requests', 'by_family_to'],
  ['rooms', 'by_family_owner'],
  ['images', 'by_family'],
  ['integrations', 'by_family'],
  ['usage', 'by_family_day'],
  ['clocks', 'by_family'],
  // GD (CONTRACT v0.13)
  ['shareActions', 'by_family_owner'],
  ['shareSuggestions', 'by_family_owner_status'],
  ['collisions', 'by_family_status'],
  ['proposals', 'by_family_status'],
  ['giftIdeas', 'by_family_for'],
  ['homeworkSheets', 'by_family_creator'],
  ['practiceSets', 'by_family_for'],
  ['practiceAttempts', 'by_family_set'],
  ['chores', 'by_family_for'],
  ['choreClaims', 'by_family_status'],
  ['routines', 'by_family_member_kind'],
  ['routineRuns', 'by_family_member_kind_date'],
  ['bucksLedger', 'by_family_member_at'],
  ['purchases', 'by_family_member'],
  // G4 (CONTRACT v0.15)
  ['places', 'by_family_kind'],
  ['weatherCache', 'by_family_place_kind'],
  ['travelChecks', 'by_family_event_checked'],
  ['searchLog', 'by_family_member_at'],
  // G4b (CONTRACT v0.16)
  ['priceWatches', 'by_family_status'],
  ['routineSkips', 'by_family_date'],
  ['holidays', 'by_family_country_year'],
  // G5 (CONTRACT v0.17)
  ['integrationSecrets', 'by_family_member_provider'],
  ['oauthStates', 'by_family_member'],
  ['mailItems', 'by_family_member_found'],
  ['onboarding', 'by_family_member'],
  ['profilerRuns', 'by_family_member_day'],
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

async function createSampleFamily(ctx: MutationCtx, weekOf: string | undefined, homeworkStorageId?: Id<'_storage'>): Promise<{ familyId: Id<'families'>; members: Record<SampleKey, Id<'members'>> }> {
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

    // places (G4, v0.15): household data, public landmarks only; linking events to them is the G4 backend's
    for (const p of S.places) {
      await ctx.db.insert('places', {
        familyId,
        kind: p.kind,
        label: p.label,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        geocode: { status: 'seed' },
        createdBy: m.admin,
        updatedAt: demoNow,
        ...(p.outdoor ? { outdoor: true } : {}),
      });
    }

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

    // GD (Screens 10–12): layers, the clash + negative control, chores, homework, routines, Mega Bucks, gifts.
    // The homework sheet needs a stored photo; `seed.resetDemo` stores the synthetic worksheet and passes it.
    await seedGd(ctx, { familyId, m, hubId: mega.family, sunday, at, now: demoNow, homeworkStorageId });
    // G4: events linked to saved places, past kid searches, Thursday's pickup travel check (docs/gates/G4.md).
    await seedG4(ctx, { familyId, m, now: demoNow });
    await seedG4b(ctx, { familyId, m, now: demoNow });
    await seedG5(ctx, { familyId, m, now: demoNow, timezone: tz });

    return { familyId, members: m };
}

export const sampleFamily = internalMutation({
  args: { weekOf: v.optional(v.string()), homeworkStorageId: v.optional(v.id('_storage')) },
  returns: v.object({ familyId: v.id('families'), members: v.record(v.string(), v.id('members')) }),
  handler: async (ctx, args) => createSampleFamily(ctx, args.weekOf, args.homeworkStorageId),
});

/** Deletes any existing sample family (matched by name — `SAMPLE_FAMILY.name`, there's only ever meant to
 * be one on a demo deployment) and seeds a fresh one in its place, reapplying whichever REAL authId each
 * sample member had been linked to (via `demo.signInAs`) so a currently-signed-in demo session doesn't get
 * silently logged out of its persona by the reset. See this file's header comment for why re-seeding needs
 * this at all (`sampleFamily` alone collides `members.by_authId`). `DEMO_MODE`-gated, same as `clock.jump`
 * — an internal function, so this is defense in depth (it's never reachable from the client either way),
 * not the only thing stopping a production deployment from wiping real family data. */
export const resetSampleFamily = internalMutation({
  args: { weekOf: v.optional(v.string()), homeworkStorageId: v.optional(v.id('_storage')) },
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

    const created = await createSampleFamily(ctx, args.weekOf, args.homeworkStorageId);
    for (const x of S.members) {
      const carriedAuthId = authIdByName.get(x.name);
      if (carriedAuthId && carriedAuthId !== `sample:${x.key}`) {
        await ctx.db.patch(created.members[x.key], { authId: carriedAuthId, joinedAt: Date.now() });
      }
    }
    return created;
  },
});

/** Live check only (G5): removes a family a live onboarding run created, so the dev deployment keeps only the
 * sample family. Refuses unless DEMO_MODE and the family's admin signed in as a `live-check:` identity (never a
 * real person's family). `npx convex run seed:deleteLiveCheckFamily '{"familyId":"…"}'`. */
export const deleteLiveCheckFamily = internalMutation({
  args: { familyId: v.id('families') },
  returns: v.null(),
  handler: async (ctx, { familyId }) => {
    if (process.env[DEMO.envVar] !== 'true') throw new Error(`deleteLiveCheckFamily refuses to run unless ${DEMO.envVar}=true on this deployment`);
    const family = await ctx.db.get(familyId);
    const admin = family?.adminId ? await ctx.db.get(family.adminId) : null;
    if (!family || !admin?.authId?.startsWith('live-check:')) throw new Error('not a live-check family');
    await deleteFamilyCompletely(ctx, familyId);
    return null;
  },
});

/** Demo / live check only (G4b): real prices rarely drop on cue, so this STAGES one — every active price watch's
 * baseline is set `percent` above its last checked live price and its last alert cleared — then runs the normal
 * price check, which finds the "drop" and sends the usual cards. The "was" price it shows is staged, not a real
 * past price: never use it outside a demo, and `seed.resetDemo` puts real baselines back. DEMO_MODE-gated.
 * `npx convex run seed:demoStagePriceDrop '{"percent":25}'`. */
export const demoStagePriceDrop = internalMutation({
  args: { percent: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, { percent }) => {
    if (process.env[DEMO.envVar] !== 'true') throw new Error(`demoStagePriceDrop refuses to run unless ${DEMO.envVar}=true on this deployment`);
    const family = (await ctx.db.query('families').take(1000)).find((f) => f.name === S.name);
    if (!family) throw new Error('no sample family — run seed:resetDemo first');
    const watches = await ctx.db
      .query('priceWatches')
      .withIndex('by_family_status', (q) => q.eq('familyId', family._id).eq('status', 'watching'))
      .collect();
    const pct = Math.min(90, Math.max(15, percent ?? 25));
    for (const w of watches) await ctx.db.patch(w._id, { baselinePriceCents: Math.round(((w.lastPriceCents ?? w.baselinePriceCents) * (100 + pct)) / 100), alertedPriceCents: undefined });
    if (watches.length) await ctx.scheduler.runAfter(0, internal.shopping.checkFamily, { familyId: family._id });
    return watches.length;
  },
});

/** Demo only (Screen 9 redesign): the sample family has no one left to invite, so this adds an unjoined
 * adult ("Grandparent") and kid ("Cousin", Admin's) — reusing them on a rerun — and returns a fresh invite
 * link for each, so the adult and kid join screens can be shown live. `npx convex run seed:sampleInvites`.
 * Not part of `resetDemo` (it changes who's in the family). DEMO_MODE-gated. */
export const sampleInvites = internalMutation({
  args: {},
  returns: v.object({ adultUrl: v.string(), kidUrl: v.string() }),
  handler: async (ctx) => {
    if (process.env[DEMO.envVar] !== 'true') throw new Error(`sampleInvites refuses to run unless ${DEMO.envVar}=true on this deployment`);
    const family = (await ctx.db.query('families').take(1000)).find((f) => f.name === S.name);
    if (!family?.adminId) throw new Error('no sample family — run seed:resetDemo first');
    const familyId = family._id;
    const adminId = family.adminId;
    const members = await ctx.db
      .query('members')
      .withIndex('by_family', (q) => q.eq('familyId', familyId))
      .collect();
    const now = await clock.now(ctx, familyId);

    const person = async (name: string, role: 'adult' | 'kid') => {
      const found = members.find((m) => m.name === name && !m.authId);
      if (found) return found._id;
      const id = await ctx.db.insert('members', { familyId, name, role, activities: [], hasMega: false });
      if (role === 'kid') await ctx.db.insert('relationships', { familyId, from: adminId, to: id, kind: 'parent' });
      return id;
    };
    const invite = async (memberId: Id<'members'>, mega: { name: string; look: { hex: string; sticker: 'star' | 'leaf' }; personality: 'calm' | 'cheerful' }) => {
      const { token, hash } = await randomToken();
      await ctx.db.insert('invites', { familyId, memberId, tokenHash: hash, expiresAt: now + LIMITS.invite.ttlHours * 3_600_000, invitedBy: adminId, mega });
      return LINKS.join(token);
    };
    const adultUrl = await invite(await person('Grandparent', 'adult'), { name: 'Maple', look: { hex: COLORS.leaf, sticker: 'leaf' }, personality: 'calm' });
    const kidUrl = await invite(await person('Cousin', 'kid'), { name: 'Sparky', look: { hex: COLORS.violet, sticker: 'star' }, personality: 'cheerful' });
    return { adultUrl, kidUrl };
  },
});

/** The full demo reset (STATUS.md -> Running things): stores the synthetic fractions worksheet in file
 * storage (a mutation can't), then rebuilds the sample family with it. `npx convex run seed:resetDemo`.
 * DEMO_MODE-gated through `resetSampleFamily`. */
export const resetDemo = internalAction({
  args: { weekOf: v.optional(v.string()) },
  returns: v.object({ familyId: v.id('families'), members: v.record(v.string(), v.id('members')) }),
  handler: async (ctx, args): Promise<{ familyId: Id<'families'>; members: Record<string, Id<'members'>> }> => {
    const bytes = Uint8Array.from(atob(FRACTIONS_SHEET.base64), (c) => c.charCodeAt(0));
    const homeworkStorageId = await ctx.storage.store(new Blob([bytes], { type: FRACTIONS_SHEET.contentType }));
    const family = await ctx.runMutation(internal.seed.resetSampleFamily, { weekOf: args.weekOf, homeworkStorageId });
    // G4: the seed has no made-up forecast (invariant 7); fetch the real one through the Weather port instead.
    await ctx.scheduler.runAfter(0, internal.weather.pollFamily, { familyId: family.familyId, force: true });
    // G4b: in real mode the sample product ref and watch give way to live catalog results (never invented
    // prices); the holiday cache is refreshed from Nager.Date.
    if (realAdaptersOn()) {
      await ctx.scheduler.runAfter(0, internal.gifts.attachSampleProducts, { familyId: family.familyId });
      await ctx.scheduler.runAfter(0, internal.holidays.refreshFamily, { familyId: family.familyId });
    }
    return family;
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
