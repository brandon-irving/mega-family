// GD seed (docs/gates/GD.md backend task 1): the sample family's data for Screens 10–12, so every board has
// something to show without waiting on a model. Synthetic only. Cards are posted straight into threads (no
// pushes) the same way the G1 seed posts its messages. Called by convex/seed.ts after the clock exists.
import { CLASH, SHARE_TO_SCOPE } from '../../shared/config/calendar';
import { HOMEWORK, ROUTINES } from '../../shared/config/kids';
import { MODELS } from '../../shared/config/models';
import { STORE_CATALOG } from '../../shared/config/store';
import { clashDedupeKey } from '../../shared/config/proactive';
import { SAMPLE_FAMILY as S, type SampleKey } from '../../shared/fixtures/sampleFamily';
import { FRACTIONS_SHEET } from '../../shared/fixtures/homework/fractionsSheet';
import { addDays, localDate } from '../../shared/time';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { giftFactLabel } from './gifts';
import { eventPreview } from './layers';
import { postCard } from './proactive';
import { scopeKey } from './scopes';

const MINUTE = 60_000;

export async function seedGd(
  ctx: MutationCtx,
  p: {
    familyId: Id<'families'>;
    m: Record<SampleKey, Id<'members'>>;
    hubId: Id<'megas'>;
    sunday: string;
    at: (day: number, minutes: number) => number;
    now: number;
    homeworkStorageId?: Id<'_storage'>;
  },
): Promise<void> {
  const { familyId, m, at, now } = p;
  const G = S.gd;
  const tz = S.timezone;

  // birthdays (stored with a birth year; the gift trigger uses the next occurrence)
  for (const b of G.birthdays) {
    const date = addDays(p.sunday, b.daysFromSunday);
    await ctx.db.patch(m[b.key], { birthday: `${Number(date.slice(0, 4)) - b.age}${date.slice(4)}` });
  }

  // household-shared facts (gift ideas may cite only these)
  const factIds: Id<'memories'>[] = [];
  for (const f of G.sharedFacts) {
    factIds.push(
      await ctx.db.insert('memories', {
        familyId,
        scope: f.scope,
        scopeKey: scopeKey(familyId, { scope: f.scope as 'family' | 'adults' }),
        about: f.about.map((k) => m[k]),
        kind: f.kind,
        text: f.text,
        source: { kind: 'onboarding' },
        trigger: 'explicit',
        confidence: 1,
        confirmed: true,
        sensitive: false,
        pinned: false,
        createdAt: now,
        lastUsedAt: now,
      }),
    );
  }

  // Thursday: the clash, the negative control, and Partner's private haircut
  const ev = {} as Record<string, Id<'events'>>;
  for (const e of G.events) {
    const isPrivate = e.layer === 'private';
    const scope = isPrivate ? 'personal' : e.sharedByOwner ? SHARE_TO_SCOPE : 'family';
    ev[e.key] = await ctx.db.insert('events', {
      familyId,
      title: e.title,
      start: at(e.day, e.start),
      end: at(e.day, e.end),
      who: e.who.map((k) => m[k]),
      source: 'mega',
      createdBy: m[e.owner],
      scope,
      cancelled: false,
      ownerId: isPrivate || e.sharedByOwner ? m[e.owner] : undefined,
    });
    if (e.sharedByOwner) {
      await ctx.db.insert('shareActions', { familyId, ownerId: m[e.owner], item: { kind: 'event', eventId: ev[e.key] }, action: 'share', fromScope: 'personal', toScope: scope, at: now - 60 * MINUTE });
    }
  }

  // the pending clash proposal (Hub, AI-labeled): Admin takes soccer pickup — nothing changed yet
  const pickup = (await ctx.db.get(ev.pickup))!;
  const clashIds: [Id<'events'>, Id<'events'>] = ev.dinner < ev.pickup ? [ev.dinner, ev.pickup] : [ev.pickup, ev.dinner];
  const collisionId = await ctx.db.insert('collisions', { familyId, eventIds: clashIds, memberId: m.partner, dedupeKey: clashDedupeKey(clashIds, m.partner), detectedAt: now, status: 'open' });
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', familyId))
    .collect();
  const before = { eventId: pickup._id, title: pickup.title, start: pickup.start, end: pickup.end, who: pickup.who };
  const proposalId = await ctx.db.insert('proposals', {
    familyId,
    collisionId,
    megaId: p.hubId,
    fix: { kind: 'reassign', eventId: pickup._id, from: m.partner, to: m.admin },
    title: G.proposal.title,
    text: G.proposal.text,
    before,
    after: { ...before, who: pickup.who.map((id) => (id === m.partner ? m.admin : id)) },
    wordedBy: `model:${MODELS.wording.model}`,
    reasonedBy: `model:${MODELS.chat.model}`,
    audience: members.map((x) => x._id).sort(),
    status: 'pending',
    createdAt: now,
    expiresAt: Math.min(now + CLASH.expireAfterHours * 60 * MINUTE, pickup.start),
  });
  await postCard(ctx, { familyId, recipientId: m.admin, card: { kind: 'proposal', proposalId }, megaId: p.hubId, now });

  // the pending share suggestion to Admin (only Admin) for the private dentist appointment
  const dentist = (await ctx.db.get(ev.dentist))!;
  const suggestionId = await ctx.db.insert('shareSuggestions', {
    familyId,
    ownerId: m.admin,
    item: { kind: 'event', eventId: dentist._id },
    preview: eventPreview(dentist, tz),
    audience: members.filter((x) => x._id !== m.admin).map((x) => x._id),
    status: 'pending',
    createdAt: now,
    decidedBy: 'rule:privateOverlapsHousehold',
  });
  await postCard(ctx, { familyId, recipientId: m.admin, card: { kind: 'shareSuggestion', suggestionId }, now });

  // chores, with today's Dishes waiting for an adult
  const today = localDate(now, tz);
  for (const c of G.chores) {
    const choreId = await ctx.db.insert('chores', { familyId, forMemberId: m[c.for], title: c.title, bucks: c.bucks, days: [0, 1, 2, 3, 4, 5, 6], time: c.time, createdBy: m.admin, active: true });
    if (c.key === G.claimedChore) {
      const claimId = await ctx.db.insert('choreClaims', { familyId, choreId, forMemberId: m[c.for], date: today, status: 'claimed', claimedAt: now - 10 * MINUTE });
      for (const adult of ['admin', 'partner'] as const) await postCard(ctx, { familyId, recipientId: m[adult], card: { kind: 'chore', claimId }, now });
      // …and the kid's own card (board KidsChore), in its "told your grown-ups" state.
      await postCard(ctx, { familyId, recipientId: m[c.for], card: { kind: 'chore', claimId }, now: now - 10 * MINUTE });
    }
  }

  // homework: the synthetic fractions sheet, and Twin 1's finished practice (4 of 5, 2 hints)
  if (p.homeworkStorageId) {
    const sheetId = await ctx.db.insert('homeworkSheets', { familyId, createdBy: m[G.practice.by], storageId: p.homeworkStorageId, status: 'ready', topic: FRACTIONS_SHEET.topic, summary: FRACTIONS_SHEET.summary, createdAt: now - 3 * 60 * MINUTE });
    await postCard(ctx, { familyId, recipientId: m[G.practice.by], card: { kind: 'homework', sheetId }, now: now - 3 * 60 * MINUTE });
    const questions = G.practice.questions.slice(0, HOMEWORK.questions.max).map((q, i) => ({ id: `q${i + 1}`, ...q }));
    const startedAt = now - 2 * 60 * MINUTE;
    const finishedAt = startedAt + G.practice.minutes * MINUTE;
    const setId = await ctx.db.insert('practiceSets', {
      familyId,
      sheetId,
      forMemberId: m[G.practice.for],
      createdBy: m[G.practice.by],
      status: 'done',
      questions,
      createdAt: startedAt - 5 * MINUTE,
      startedAt,
      finishedAt,
      summary: { correct: questions.length - G.practice.missed.length, total: questions.length, hintsUsed: G.practice.hinted.length, minutes: G.practice.minutes, note: G.practice.note },
    });
    for (const [i, q] of questions.entries()) {
      const kid = m[G.practice.for];
      if (G.practice.hinted.includes(i)) await ctx.db.insert('practiceAttempts', { familyId, setId, questionId: q.id, memberId: kid, kind: 'hint', at: startedAt + i * MINUTE });
      if (G.practice.missed.includes(i)) {
        const wrong = (q.answerIndex + 1) % q.choices.length;
        for (let t = 0; t < HOMEWORK.maxTriesPerQuestion; t++) await ctx.db.insert('practiceAttempts', { familyId, setId, questionId: q.id, memberId: kid, kind: 'answer', choiceIndex: wrong, correct: false, at: startedAt + i * MINUTE + t + 1 });
      } else {
        await ctx.db.insert('practiceAttempts', { familyId, setId, questionId: q.id, memberId: kid, kind: 'answer', choiceIndex: q.answerIndex, correct: true, at: startedAt + i * MINUTE + 1 });
      }
    }
    await postCard(ctx, { familyId, recipientId: m[G.practice.for], card: { kind: 'practice', setId }, now: startedAt });
    await postCard(ctx, { familyId, recipientId: m[G.practice.by], card: { kind: 'practice', setId }, now: finishedAt });
  }

  // routines for both twins, and today's half-done morning list for Twin 1
  for (const key of ['twin1', 'twin2'] as const) {
    await ctx.db.insert('routines', { familyId, memberId: m[key], kind: 'morning', steps: ROUTINES.morningSteps.map((s) => ({ ...s })), time: ROUTINES.defaultTime.morning, days: [1, 2, 3, 4, 5], updatedBy: m.admin });
    await ctx.db.insert('routines', { familyId, memberId: m[key], kind: 'bedtime', steps: ROUTINES.bedtimeSteps.map((s) => ({ ...s })), time: ROUTINES.defaultTime.bedtime, days: [0, 1, 2, 3, 4], updatedBy: m.admin });
  }
  const morning = await ctx.db
    .query('routines')
    .withIndex('by_family_member_kind', (q) => q.eq('familyId', familyId).eq('memberId', m[G.morningRun.for]).eq('kind', 'morning'))
    .first();
  if (morning) {
    const runId = await ctx.db.insert('routineRuns', {
      familyId,
      routineId: morning._id,
      memberId: m[G.morningRun.for],
      kind: 'morning',
      date: today,
      steps: morning.steps.map((s) => ({ id: s.id, label: s.label, detail: s.detail, done: G.morningRun.doneSteps.includes(s.id) })),
      createdAt: now - 9 * 60 * MINUTE,
    });
    await postCard(ctx, { familyId, recipientId: m[G.morningRun.for], card: { kind: 'routine', runId }, now: now - 9 * 60 * MINUTE });
  }

  // Twin 2's bedtime list for soccer practice (board KidsBedtime): items sourced from the household event,
  // then the routine's own steps, as the bedtime sweep would build it.
  const B = G.bedtimeRun;
  const bedtime = await ctx.db
    .query('routines')
    .withIndex('by_family_member_kind', (q) => q.eq('familyId', familyId).eq('memberId', m[B.for]).eq('kind', 'bedtime'))
    .first();
  const bedtimeEvent = G.events.find((e) => e.key === B.event);
  if (bedtime && bedtimeEvent) {
    const source = { eventId: ev[B.event], title: bedtimeEvent.title };
    const runId = await ctx.db.insert('routineRuns', {
      familyId,
      routineId: bedtime._id,
      memberId: m[B.for],
      kind: 'bedtime',
      date: today,
      steps: [...B.items.map((i) => ({ ...i, done: false, source })), ...bedtime.steps.map((s) => ({ id: s.id, label: s.label, detail: s.detail, done: false }))],
      createdAt: now - 5 * MINUTE,
    });
    await postCard(ctx, { familyId, recipientId: m[B.for], card: { kind: 'routine', runId }, now: now - 5 * MINUTE });
  }

  // Mega Bucks history and the plant Twin 1 bought (balance 3 for Twin 1)
  let t = now - 3 * 24 * 60 * MINUTE;
  for (const b of G.bucks) {
    const ledgerId = await ctx.db.insert('bucksLedger', { familyId, memberId: m[b.for], delta: b.delta, source: { kind: 'bonus' }, byId: m[b.by], note: b.note, at: (t += 60 * MINUTE) });
    if (b === G.bucks[0]) await postCard(ctx, { familyId, recipientId: m[b.for], card: { kind: 'bucks', ledgerId }, now: t });
  }
  for (const pu of G.purchases) {
    const price = STORE_CATALOG[pu.itemId].price;
    const purchaseId = await ctx.db.insert('purchases', { familyId, memberId: m[pu.for], itemId: pu.itemId, price, at: (t += 60 * MINUTE) });
    await ctx.db.insert('bucksLedger', { familyId, memberId: m[pu.for], delta: -price, source: { kind: 'purchase', purchaseId }, byId: m[pu.for], at: t });
  }

  // Twin 1's ready gift ideas, cited from the shared facts (adults only; never Twin 1)
  const gifts = G.gifts;
  const twin = (await ctx.db.get(m[gifts.for]))!;
  const birthday = addDays(p.sunday, G.birthdays.find((b) => b.key === gifts.for)!.daysFromSunday);
  const basedOn = gifts.facts.map((f) =>
    f === 'activities'
      ? { label: `${twin.name} plays ${twin.activities.join(' and ').toLowerCase()}`, source: { kind: 'member' as const, field: 'activities' as const } }
      : { label: giftFactLabel(twin.name, G.sharedFacts[f].text, G.sharedFacts[f].about.includes(gifts.for)), source: { kind: 'memory' as const, memoryId: factIds[f] } },
  );
  const giftIdeasId = await ctx.db.insert('giftIdeas', { familyId, forMemberId: twin._id, occasion: 'birthday', date: birthday, basedOn, ideas: gifts.ideas.map((i) => ({ ...i })), status: 'ready', createdAt: now, addedToList: [] });
  for (const adult of ['admin', 'partner'] as const) await postCard(ctx, { familyId, recipientId: m[adult], card: { kind: 'gifts', giftIdeasId }, now });
}

