// Seeds the sample family (CONTRACT §10) so every screen has data from day 1. Internal only.
import { v } from 'convex/values';
import { KID_SAFETY, LIMITS, NOTIFICATION_KINDS_CONFIG, ROOM_DEFAULTS } from '../shared/config';
import { BUTTON_SETS } from '../shared/config/notifications';
import { SAMPLE_FAMILY as S, type SampleKey } from '../shared/fixtures/sampleFamily';
import { addDays, dayOfWeek, localDate, zonedInstant } from '../shared/time';
import type { Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { scopeKey } from './model/scopes';

const emptyCounts = { sent: 0, answered: 0, ignored: 0, up: 0, down: 0 };

export const sampleFamily = internalMutation({
  args: { weekOf: v.optional(v.string()) },
  returns: v.object({ familyId: v.id('families'), members: v.record(v.string(), v.id('members')) }),
  handler: async (ctx, args) => {
    const realNow = Date.now(); // the one allowed real-clock read: it anchors the demo clock (clocks.offsetMs)
    const tz = S.timezone;
    const today = localDate(realNow, tz);
    const sunday = args.weekOf ?? addDays(today, -dayOfWeek(today));
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
    const requestId = await ctx.db.insert('requests', { familyId, fromMemberId: m[req.from], toMemberId: m[req.to], text: req.text, status: 'open', onAccept: { tool: 'lists_add', listName: 'Groceries', text: 'Milk' } });
    const notificationId = await ctx.db.insert('notifications', {
      familyId,
      recipientId: m[req.to],
      kind: 'request',
      loudness: requestCfg.loudness,
      title: `${S.megas.find((x) => x.owner === req.from)!.name} asks`,
      body: req.text,
      megaId: mega[req.to],
      buttons: [...BUTTON_SETS[requestCfg.buttons]],
      requestId,
      sentAt: demoNow - 5 * 60_000,
    });
    const messageId = await message(ctx, familyId, thread[req.to], demoNow - 5 * 60_000, { kind: 'mega', id: mega[req.to] }, { type: 'card', card: { kind: 'notification', notificationId } }, notificationId);
    await ctx.db.patch(notificationId, { messageId });
    await ctx.db.patch(requestId, { notificationId });

    // a kid reminder held by quiet hours. reminderId (G3): links the notification back to the reminder it
    // came from, so answering "On my way" / "Snooze 5 min" (convex/model/notificationEffects.ts) has a
    // real row to act on — the same link convex/model/proactive.ts's reminder trigger sets.
    const h = S.heldReminder;
    const dueAt = at(h.day, h.minutes);
    const reminderCfg = NOTIFICATION_KINDS_CONFIG.reminder;
    const reminderId = await ctx.db.insert('reminders', { familyId, forMemberId: m[h.for], text: h.text, dueAt, done: false, createdBy: m.admin });
    const [qh, qm] = LIMITS.quietHours.kid.end.split(':').map(Number);
    await ctx.db.insert('notifications', {
      familyId,
      recipientId: m[h.for],
      kind: 'reminder',
      loudness: reminderCfg.loudness,
      title: S.megas.find((x) => x.owner === h.for)!.name,
      body: h.text,
      megaId: mega[h.for],
      buttons: [...BUTTON_SETS[reminderCfg.buttons]],
      reminderId,
      heldUntil: at(h.day + 1, qh * 60 + qm),
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
