/// <reference types="vite/client" />
// GD invariant 5 (hints, never answers) plus the kids' features: homework → practice, chores, routines.
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HOMEWORK } from '../shared/config/kids';
import { jsonReply, makeFakeChatModel, textReply } from './adapters/fakeChatModel';
import { makeFakePushSender } from './adapters/fakePushSender';
import { __setChatModelForTests, __setPushSenderForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { isGivingAway, isUsableQuestion } from './model/practice';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';

beforeEach(() => {
  vi.useFakeTimers();
  process.env.DEMO_MODE = 'true';
});
afterEach(() => {
  vi.useRealTimers();
  __setChatModelForTests(null);
  __setPushSenderForTests(null);
  delete process.env.DEMO_MODE;
});

const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: string }).code : (e as { data?: { code?: string } })?.data?.code);

async function seeded() {
  const t = convexTest(schema, modules);
  const photo = await t.run((ctx) => ctx.storage.store(new Blob(['png-bytes'], { type: 'image/png' })));
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK, homeworkStorageId: photo });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  const sets = () => t.run((ctx) => ctx.db.query('practiceSets').withIndex('by_family_for', (q) => q.eq('familyId', familyId)).collect());
  const sheet = async () => (await t.run((ctx) => ctx.db.query('homeworkSheets').withIndex('by_family_creator', (q) => q.eq('familyId', familyId)).collect()))[0];
  return { t, familyId, m, as, sets, sheet, photo };
}

const Q = (hint: string, answerIndex = 1) => ({ prompt: 'What is 1/2 + 1/4?', choices: ['2/6', '3/4', '1/8', '2/4'], answerIndex, hint });

describe('GD invariant 5: hints, never answers', () => {
  test('a hint that contains the correct choice gives it away; a guiding question does not', () => {
    expect(isGivingAway(Q('The answer is 3/4.'))).toBe(true);
    expect(isGivingAway(Q('It is 3 / 4'))).toBe(true); // spacing doesn't hide it
    expect(isGivingAway(Q('Can you write 1/2 with a bottom of 4 first?'))).toBe(false);
    expect(isUsableQuestion(Q('Think: 3/4?'))).toBe(false);
    expect(isUsableQuestion({ ...Q('Write 1/2 in fourths?'), choices: ['a', 'a', 'b', 'c'] })).toBe(false); // duplicate choices
  });

  test('no practice response ever carries the answer — not to the kid, not to the parent', async () => {
    const { as, sets } = await seeded();
    const set = (await sets())[0];
    for (const k of ['twin1', 'admin', 'partner'] as const) {
      const view = await as(k).query(api.practice.get, { setId: set._id });
      const json = JSON.stringify(view);
      expect(json).not.toContain('answerIndex');
      for (const q of view.questions) expect(Object.keys(q)).not.toContain('answerIndex');
    }
    expect(codeOf(await as('twin2').query(api.practice.get, { setId: set._id }).catch((e) => e))).toBe('FORBIDDEN'); // a sibling
  });

  test('drafting: a hint that gives the answer away is redrafted once, and dropped if it still does', async () => {
    const { t, m, as, sheet, sets } = await seeded();
    const calls: number[] = [];
    __setChatModelForTests(
      makeFakeChatModel((req, i) => {
        if (req.schema?.name !== 'practiceQuestions') return jsonReply({});
        calls.push(i);
        expect(req.model).toBe('vision');
        expect(req.messages.some((x) => x.images?.[0]?.startsWith('data:image/png;base64,'))).toBe(true);
        const good = (n: number) => ({ ...Q(`Guiding question ${n}?`), prompt: `Q${n}?` });
        if (calls.length === 1) return jsonReply({ questions: [good(1), good(2), { ...Q('The answer is 3/4'), prompt: 'Bad?' }, good(3)] });
        return jsonReply({ questions: [{ ...Q('Still 3/4!'), prompt: 'Bad again?' }, good(4)] });
      }),
    );
    const s = await sheet();
    const { setId } = await as('admin').mutation(api.homework.makePractice, { sheetId: s._id, forMemberId: m.twin2, count: 4 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls).toHaveLength(2);
    const set = (await sets()).find((x) => x._id === setId)!;
    expect(set.status).toBe('ready');
    expect(set.questions.map((q) => q.prompt)).toEqual(['Q1?', 'Q2?', 'Q3?', 'Q4?']);
    for (const q of set.questions) expect(isGivingAway(q)).toBe(false);
  });

  test('the mutation re-checks too: finishDraft drops giveaways and fails a set with too few good questions', async () => {
    const { t, m, as, sheet, sets } = await seeded();
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ questions: [] })));
    const s = await sheet();
    const { setId } = await as('admin').mutation(api.homework.makePractice, { sheetId: s._id, forMemberId: m.twin2, count: 3 });
    await t.mutation(internal.homework.finishDraft, { setId, questions: [Q('The answer is 3/4'), Q('Ok?'), Q('Fine?')] });
    expect((await sets()).find((x) => x._id === setId)!.status).toBe('failed');
  });

  test("answering: wrong returns the hint (never the answer); a parent or sibling can't answer", async () => {
    const { t, m, as, sheet, sets } = await seeded();
    __setChatModelForTests(makeFakeChatModel(() => textReply('Fractions with different bottoms were tricky.')));
    const s = await sheet();
    const { setId } = await as('admin').mutation(api.homework.makePractice, { sheetId: s._id, forMemberId: m.twin2, count: 3 });
    await t.mutation(internal.homework.finishDraft, { setId, questions: [Q('Write 1/2 in fourths?'), Q('How many fourths in a half?'), Q('What do you add?')] });
    const set = (await sets()).find((x) => x._id === setId)!;
    expect(codeOf(await as('admin').mutation(api.practice.answer, { setId, questionId: 'q1', choiceIndex: 1 }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await as('twin1').mutation(api.practice.answer, { setId, questionId: 'q1', choiceIndex: 1 }).catch((e) => e))).toBe('FORBIDDEN');

    const wrong = await as('twin2').mutation(api.practice.answer, { setId, questionId: 'q1', choiceIndex: 0 });
    expect(wrong).toEqual({ correct: false, hint: set.questions[0].hint, done: false });
    expect(JSON.stringify(wrong)).not.toContain('3/4');
    const right = await as('twin2').mutation(api.practice.answer, { setId, questionId: 'q1', choiceIndex: 1 });
    expect(right.correct).toBe(true);
    // two wrong tries settle a question as missed
    await as('twin2').mutation(api.practice.answer, { setId, questionId: 'q2', choiceIndex: 0 });
    await as('twin2').mutation(api.practice.answer, { setId, questionId: 'q2', choiceIndex: 2 });
    expect(codeOf(await as('twin2').mutation(api.practice.answer, { setId, questionId: 'q2', choiceIndex: 1 }).catch((e) => e))).toBe('VALIDATION');
    await as('twin2').mutation(api.practice.hint, { setId, questionId: 'q3' });
    const last = await as('twin2').mutation(api.practice.answer, { setId, questionId: 'q3', choiceIndex: 1 });
    expect(last.done).toBe(true);
    expect(HOMEWORK.maxTriesPerQuestion).toBe(2);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const done = await as('admin').query(api.practice.get, { setId });
    expect(done.summary).toMatchObject({ correct: 2, total: 3, hintsUsed: 1, note: 'Fractions with different bottoms were tricky.' });
    expect(done.canRelease).toBe(true);
  });
});

describe('GD: homework photos', () => {
  test('only adults submit; an oversized or non-image file is refused before any model call', async () => {
    const { t, as } = await seeded();
    const small = await t.run((ctx) => ctx.storage.store(new Blob(['x'], { type: 'image/png' })));
    expect(codeOf(await as('twin1').mutation(api.homework.submit, { storageId: small }).catch((e) => e))).toBe('FORBIDDEN');
    const text = await t.run((ctx) => ctx.storage.store(new Blob(['x'], { type: 'text/plain' })));
    expect(codeOf(await as('admin').mutation(api.homework.submit, { storageId: text }).catch((e) => e))).toBe('VALIDATION');
    const big = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(HOMEWORK.maxPhotoBytes + 1)], { type: 'image/jpeg' })));
    expect(codeOf(await as('admin').mutation(api.homework.submit, { storageId: big }).catch((e) => e))).toBe('VALIDATION');
  });

  test('the photo is read by the vision model and the sheet card lands in the parent’s thread', async () => {
    const { t, familyId, m, as } = await seeded();
    __setChatModelForTests(makeFakeChatModel((req) => jsonReply(req.schema?.name === 'homeworkRead' ? { isWorksheet: true, topic: 'Fractions · Sheet 5', summary: 'Adding fractions, 6 problems.' } : {})));
    const photo = await t.run((ctx) => ctx.storage.store(new Blob(['png'], { type: 'image/png' })));
    const { sheetId } = await as('partner').mutation(api.homework.submit, { storageId: photo });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await as('partner').query(api.homework.sheet, { sheetId })).toMatchObject({ status: 'ready', topic: 'Fractions · Sheet 5' });
    const thread = (await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m.partner)).unique()))!;
    const msgs = await t.run((ctx) => ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', thread._id)).collect());
    expect(msgs.some((x) => x.body.type === 'card' && x.body.card.kind === 'homework')).toBe(true);
    expect(codeOf(await as('twin1').query(api.homework.sheet, { sheetId }).catch((e) => e))).toBe('FORBIDDEN');
  });

  test('makePractice: only for your own kid, count within bounds', async () => {
    const { m, as, sheet } = await seeded();
    const s = await sheet();
    expect(codeOf(await as('admin').mutation(api.homework.makePractice, { sheetId: s._id, forMemberId: m.partner, count: 3 }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await as('admin').mutation(api.homework.makePractice, { sheetId: s._id, forMemberId: m.twin1, count: 9 }).catch((e) => e))).toBe('VALIDATION');
    expect(codeOf(await as('twin1').mutation(api.homework.makePractice, { sheetId: s._id, forMemberId: m.twin1, count: 3 }).catch((e) => e))).toBe('FORBIDDEN');
  });
});

describe('GD: chores', () => {
  test("a kid finishes only their own chore; Done is idempotent and asks the adults", async () => {
    const { t, familyId, m, as } = await seeded();
    const fish = (await as('twin1').query(api.chores.list, {})).find((c) => c.chore.title === 'Feed the fish')!.chore;
    expect(codeOf(await as('twin2').mutation(api.chores.markDone, { choreId: fish._id }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await as('twin2').query(api.chores.list, { memberId: m.twin1 }).catch((e) => e))).toBe('FORBIDDEN');
    const a = await as('twin1').mutation(api.chores.markDone, { choreId: fish._id });
    const b = await as('twin1').mutation(api.chores.markDone, { choreId: fish._id });
    expect(a).toBe(b);
    const candidates = await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_dedupeKey', (q) => q.eq('familyId', familyId)).collect());
    expect(candidates.filter((c) => c.source?.kind === 'chore' && c.source.claimId === a).map((c) => c.recipientId).sort()).toEqual([m.admin, m.partner].sort());
  });

  test('at chore time the kid gets a reminder with Done / In 10 min; tapping Done on the push claims it', async () => {
    const { t, familyId, m, as } = await seeded();
    const pushes = makeFakePushSender();
    __setPushSenderForTests(pushes);
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ kind: 'update', title: '', text: '', score: 0, reason: '' })));
    await as('twin1').mutation(api.push.register, { token: 'ExponentPushToken[t1]', platform: 'ios' });
    await as('admin').mutation(api.clock.jump, { to: Date.parse('2026-10-26T12:05:00Z') }); // Monday 8:05 AM NY
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const notes = await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', m.twin1)).collect());
    const chore = notes.find((n) => n.choreId)!;
    expect(chore.buttons.map((b) => b.id)).toEqual(['done', 'snooze_10']);
    expect(pushes.sent.find((p) => p.data.notificationId === chore._id)?.categoryId).toBe('chore.default');
    await as('twin1').mutation(api.notifications.answer, { notificationId: chore._id, buttonId: 'done', via: 'push' });
    const claim = (await as('twin1').query(api.chores.list, {})).find((c) => c.chore._id === chore.choreId)!.today!;
    expect(claim.status).toBe('claimed');
  });
});

describe('GD: routines', () => {
  test('a kid sees their own lists; a sibling can’t; only the kid checks steps', async () => {
    const { m, as } = await seeded();
    const run = (await as('twin1').query(api.routines.today, { kind: 'morning' }))!;
    expect(run.steps.filter((s) => s.done).map((s) => s.id)).toEqual(['dressed', 'teeth']);
    expect(codeOf(await as('twin2').query(api.routines.today, { kind: 'morning', memberId: m.twin1 }).catch((e) => e))).toBe('FORBIDDEN');
    expect(await as('admin').query(api.routines.today, { kind: 'morning', memberId: m.twin1 })).not.toBeNull();
    expect(codeOf(await as('admin').mutation(api.routines.check, { runId: run._id, stepId: 'breakfast', done: true }).catch((e) => e))).toBe('FORBIDDEN');
    await as('twin1').mutation(api.routines.check, { runId: run._id, stepId: 'breakfast', done: true });
    await as('twin1').mutation(api.routines.check, { runId: run._id, stepId: 'backpack', done: true });
    expect((await as('twin1').query(api.routines.today, { kind: 'morning' }))!.finishedAt).toBeDefined();
  });

  test("bedtime prep comes from tomorrow's household events only — a private event never feeds it", async () => {
    const { t, familyId, m, as } = await seeded();
    // Wednesday night: tomorrow (Thursday) has household soccer practice for the twins, plus a private
    // event of Twin 1's own that must not appear on the list.
    await t.run((ctx) => ctx.db.insert('events', { familyId, title: 'Secret plan', start: Date.parse('2026-10-29T14:00:00Z'), end: Date.parse('2026-10-29T15:00:00Z'), who: [m.twin1], source: 'mega', createdBy: m.twin1, ownerId: m.twin1, scope: 'personal', cancelled: false }));
    let seen = '';
    __setChatModelForTests(
      makeFakeChatModel((req) => {
        if (req.schema?.name === 'bedtimePrep') {
          seen = req.messages.map((x) => x.content).join('\n');
          const id = /\[([^\]]+)\] Soccer practice/.exec(seen)?.[1] ?? '';
          return jsonReply({ items: [{ eventId: id, label: 'Cleats', detail: '' }, { eventId: id, label: 'Water bottle', detail: '' }] });
        }
        return jsonReply({ kind: 'update', title: '', text: '', score: 0, reason: '' });
      }),
    );
    await as('admin').mutation(api.clock.jump, { to: Date.parse('2026-10-28T23:50:00Z') }); // Wed 7:50 PM NY
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(seen).toContain('Soccer practice');
    expect(seen).not.toContain('Secret plan');
    // (read the run directly: runAllTimers moves the fake wall clock, and with it the family's "today")
    const run = (await t.run((ctx) => ctx.db.query('routineRuns').withIndex('by_family_member_kind_date', (q) => q.eq('familyId', familyId).eq('memberId', m.twin1).eq('kind', 'bedtime')).collect()))[0];
    expect(run.date).toBe('2026-10-28');
    expect(run.steps.map((s) => s.label).slice(0, 2)).toEqual(['Cleats', 'Water bottle']);
    expect(run.steps[0].source?.eventId).toBeDefined();
    expect(run.steps[0].source?.title).toBe('Soccer practice'); // the card says "Soccer tomorrow"
    // v0.14a (GD UX review): the event's start rides along, so the card can say "…at 4:30".
    const soccer = await t.run((ctx) => ctx.db.get(run.steps[0].source!.eventId));
    expect(run.steps[0].source?.start).toBe(soccer!.start);
  });
});

describe('GD addenda (frontend requests): one run by id, chore snooze', () => {
  test('routines.run: the kid and their parents can read a run by id; a sibling cannot', async () => {
    const { as } = await seeded();
    const run = (await as('twin1').query(api.routines.today, { kind: 'morning' }))!;
    expect((await as('twin1').query(api.routines.run, { runId: run._id }))._id).toBe(run._id);
    expect((await as('partner').query(api.routines.run, { runId: run._id }))._id).toBe(run._id);
    expect(codeOf(await as('twin2').query(api.routines.run, { runId: run._id }).catch((e) => e))).toBe('FORBIDDEN');
  });

  test('"In 10 min" on a chore reminder re-reminds ten minutes later through the normal pipeline', async () => {
    const { t, familyId, m, as } = await seeded();
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({ kind: 'update', title: '', text: '', score: 0, reason: '' })));
    const at = Date.parse('2026-10-26T12:05:00Z'); // Monday 8:05 AM NY
    await as('admin').mutation(api.clock.jump, { to: at });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const note = (await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', m.twin1)).collect())).find((n) => n.choreId)!;
    expect(note.buttons.map((b) => b.id)).toEqual(['done', 'snooze_10']);
    await as('twin1').mutation(api.notifications.answer, { notificationId: note._id, buttonId: 'snooze_10', via: 'push' });
    const snoozed = (await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_dedupeKey', (q) => q.eq('familyId', familyId)).collect())).filter((c) => c.dedupeKey.includes(':snooze:'));
    expect(snoozed).toHaveLength(1);
    expect(snoozed[0].status).toBe('scheduled');
    expect(snoozed[0].deliverAt! - at).toBeGreaterThanOrEqual(10 * 60_000 - 5_000);
  });
});

describe('GD seed: the kid side of the demo (live check found Twin 2’s thread empty)', () => {
  test('Twin 2’s own thread has their Dishes chore card and a bedtime list for tomorrow’s soccer practice', async () => {
    const { t, m, as } = await seeded();
    const cards = await t.run(async (ctx) => {
      const msgs = await ctx.db.query('messages').collect();
      const threads = new Map((await ctx.db.query('threads').collect()).map((th) => [th._id, th]));
      return msgs
        .filter((x) => threads.get(x.threadId)?.ownerId === m.twin2 && x.body.type === 'card')
        .map((x) => (x.body as { card: { kind: string; runId?: Id<'routineRuns'> } }).card);
    });
    expect(cards.map((c) => c.kind)).toEqual(expect.arrayContaining(['chore', 'routine']));
    const runId = cards.find((c) => c.kind === 'routine')!.runId!;
    const run = await as('twin2').query(api.routines.run, { runId });
    expect(run.kind).toBe('bedtime');
    expect(run.steps.some((s) => s.source?.title === 'Soccer practice')).toBe(true);
    // v0.14a: the seeded run carries the event's real start (ms), not the fixture's minutes-of-day.
    const step = run.steps.find((s) => s.source?.title === 'Soccer practice')!;
    const event = await t.run((ctx) => ctx.db.get(step.source!.eventId));
    expect(step.source?.start).toBe(event!.start);
  });
});
