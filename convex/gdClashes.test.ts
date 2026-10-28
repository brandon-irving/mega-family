/// <reference types="vite/client" />
// GD invariants 3 and 4 (docs/gates/GD.md): the negative control (a private event overlapping a household
// one is never flagged) and "nothing changes until the Admin approves" (refused when not pending, expired,
// the family changed, or the event moved since).
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { __setChatModelForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { findClashes } from './model/clashes';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  __setChatModelForTests(null);
});

const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: string }).code : (e as { data?: { code?: string } })?.data?.code);

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const events = () => t.run((ctx) => ctx.db.query('events').withIndex('by_family_start', (q) => q.eq('familyId', familyId)).collect());
  const byTitle = async (title: string) => (await events()).find((e) => e.title === title)!;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  const proposals = () => t.run((ctx) => ctx.db.query('proposals').withIndex('by_family_status', (q) => q.eq('familyId', familyId)).collect());
  const collisions = () => t.run((ctx) => ctx.db.query('collisions').withIndex('by_family_status', (q) => q.eq('familyId', familyId)).collect());
  return { t, familyId, m, byTitle, as, proposals, collisions };
}

describe('GD invariant 3: the negative control', () => {
  test("Admin's private Dentist overlaps a household event Admin is in, and is never flagged", async () => {
    const { t, familyId, m, byTitle, as, proposals, collisions } = await seeded();
    const dentist = await byTitle('Dentist');
    // Make the overlap as strong as possible: a household event at the same time that ALSO needs Admin.
    await as('admin').mutation(api.events.create, { title: 'School assembly', start: dentist.start, end: dentist.end!, who: [m.admin], scope: 'family' });
    __setChatModelForTests(makeFakeChatModel(() => jsonReply({})));
    await t.mutation(internal.proactive.tickFamily, { familyId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    for (const c of await collisions()) expect(c.eventIds, 'no collision may include a private event').not.toContain(dentist._id);
    for (const p of await proposals()) expect(p.fix.eventId).not.toBe(dentist._id);
    const notes = await t.run((ctx) => ctx.db.query('notifications').collect());
    expect(notes.filter((n) => n.recipientId !== m.admin && /dentist/i.test(`${n.title} ${n.body}`))).toHaveLength(0);
    const partnerWeek = await as('partner').query(api.calendar.range, { from: dentist.start - 86_400_000, to: dentist.start + 86_400_000 });
    expect(partnerWeek.map((e) => e._id)).not.toContain(dentist._id);
    // and the real clash is still found (the checker isn't just switched off)
    expect((await collisions()).some((c) => c.memberId === m.partner)).toBe(true);
  });

  test('findClashes ignores private and grant events even when handed them', async () => {
    const base = { _creationTime: 0, familyId: 'f' as Id<'families'>, source: 'mega' as const, cancelled: false, who: ['a' as Id<'members'>] };
    const ev = (id: string, scope: Doc<'events'>['scope']) => ({ ...base, _id: id as Id<'events'>, title: id, start: 0, end: 3_600_000, scope }) as Doc<'events'>;
    expect(findClashes([ev('x', 'personal'), ev('y', 'family')])).toHaveLength(0);
    expect(findClashes([ev('x', 'shared'), ev('y', 'family')])).toHaveLength(0);
    expect(findClashes([ev('x', 'adults'), ev('y', 'family')])).toHaveLength(1);
  });
});

describe('GD: Hub proposes one fix (Spark reasons, Wonder words) and changes nothing', () => {
  test('a new clash gets a pending proposal from Hub, AI-labeled, with before/after — and the calendar is untouched', async () => {
    const { t, familyId, m, byTitle, as, proposals } = await seeded();
    const calls: string[] = [];
    let newEventId = '';
    __setChatModelForTests(
      makeFakeChatModel((req) => {
        calls.push(`${req.schema?.name}:${req.model ?? 'chat'}`);
        if (req.schema?.name === 'clashFix') return jsonReply({ kind: 'reassign', eventId: newEventId, toMemberId: m.partner, newStart: '', newEnd: '', reason: 'Partner is free' });
        if (req.schema?.name === 'clashWording') return jsonReply({ title: 'Partner takes the library run', text: 'Admin has the vet then, so Partner does the library run.' });
        return jsonReply({});
      }),
    );
    const vet = await as('admin').mutation(api.events.create, { title: 'Vet', start: Date.parse('2026-10-31T14:00:00Z'), end: Date.parse('2026-10-31T15:00:00Z'), who: [m.admin], scope: 'family' });
    newEventId = await as('admin').mutation(api.events.create, { title: 'Library run', start: Date.parse('2026-10-31T14:30:00Z'), end: Date.parse('2026-10-31T15:30:00Z'), who: [m.admin], scope: 'family' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toEqual(['clashFix:chat', 'clashWording:wording']); // Spark picks, Wonder only words
    const p = (await proposals()).find((x) => x.fix.eventId === newEventId)!;
    expect(p.status).toBe('pending');
    expect(p.fix).toMatchObject({ kind: 'reassign', from: m.admin, to: m.partner });
    expect(p.wordedBy).toBe('model:muse-wonder-1.0');
    expect(p.reasonedBy).toBe('model:muse-spark-1.3');
    expect(p.before.who).toEqual([m.admin]);
    expect(p.after.who).toEqual([m.partner]);
    expect((await byTitle('Library run')).who).toEqual([m.admin]); // nothing changed yet
    expect(vet).toBeDefined();

    const view = await as('admin').query(api.proposals.get, { proposalId: p._id });
    expect(view.mega.name).toBe('Hub');
    expect(view.clashEventIds).toHaveLength(2); // both clashing events, so the calendar can tag both
    expect(view.proposal.after.who).toEqual([m.partner]); // before/after carry who
    expect(view.disclosure).toMatch(/Hub .*\(AI\)\. Nothing changes until Admin approves\./);
    const adminCards = await t.run((ctx) => ctx.db.query('messages').collect());
    const card = adminCards.find((x) => x.body.type === 'card' && x.body.card.kind === 'proposal' && (x.body.card as { proposalId: string }).proposalId === p._id)!;
    expect(card.author).toEqual({ kind: 'mega', id: view.mega.megaId });
    expect(familyId).toBeDefined();
  });

  test("a model fix that isn't one of the two clashing events (e.g. the private Dentist) is refused — no proposal", async () => {
    const { t, m, byTitle, as, proposals } = await seeded();
    const dentist = await byTitle('Dentist');
    __setChatModelForTests(makeFakeChatModel((req) => (req.schema?.name === 'clashFix' ? jsonReply({ kind: 'move', eventId: dentist._id, toMemberId: '', newStart: '2026-10-31T09:00', newEnd: '2026-10-31T10:00', reason: 'x' }) : jsonReply({ title: 't', text: 'x' }))));
    const before = (await proposals()).length;
    await as('admin').mutation(api.events.create, { title: 'A', start: Date.parse('2026-10-31T14:00:00Z'), end: Date.parse('2026-10-31T15:00:00Z'), who: [m.admin], scope: 'family' });
    await as('admin').mutation(api.events.create, { title: 'B', start: Date.parse('2026-10-31T14:30:00Z'), end: Date.parse('2026-10-31T15:30:00Z'), who: [m.admin], scope: 'family' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await proposals()).length).toBe(before);
    expect((await byTitle('Dentist')).start).toBe(dentist.start);
  });
});

describe('GD: the proposal card text is one clean sentence (live finding, Oct 28)', () => {
  test('Wonder repeating the headline on its own line in "text" is cleaned up', async () => {
    const { t, familyId, m, proposals, collisions } = await seeded();
    const open = (await collisions()).find((c) => c.status === 'open')!;
    await t.run(async (ctx) => {
      for (const p of await ctx.db.query('proposals').withIndex('by_family_collision', (q) => q.eq('familyId', familyId).eq('collisionId', open._id)).collect()) await ctx.db.delete(p._id);
    });
    const pickup = (await t.run((ctx) => ctx.db.get(open.eventIds[1])))!;
    await t.mutation(internal.clashes.createProposal, {
      collisionId: open._id,
      fix: { kind: 'reassign', eventId: pickup._id, from: m.partner, to: m.admin },
      title: 'Admin takes pickup',
      text: 'Admin takes pickup\nPartner is at a work dinner then.',
      wordedBy: 'model:muse-wonder-1.0',
      reasonedBy: 'model:muse-spark-1.3',
    });
    const p = (await proposals()).find((x) => x.collisionId === open._id)!;
    expect(p.text).toBe('Partner is at a work dinner then.');
  });
});

describe('GD invariant 4: nothing changes until the Admin approves', () => {
  async function seededProposal() {
    const s = await seeded();
    const p = (await s.proposals()).find((x) => x.status === 'pending')!;
    return { ...s, p };
  }

  test('only the Admin decides; Partner and kids are refused and nothing changes', async () => {
    const { t, p, byTitle, as } = await seededProposal();
    expect(codeOf(await as('partner').mutation(api.proposals.decide, { proposalId: p._id, approve: true }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await as('twin1').mutation(api.proposals.decide, { proposalId: p._id, approve: true }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await as('twin1').query(api.proposals.open, {}).catch((e) => e))).toBe('FORBIDDEN');
    expect((await t.run((ctx) => ctx.db.get(p.fix.eventId)))!.who).toEqual(p.before.who);
    expect(byTitle).toBeDefined();
  });

  test("approval applies the fix through the normal event path, resolves the clash and tells Partner from Partner's own MEGA", async () => {
    const { t, familyId, m, p, byTitle, as } = await seededProposal();
    const pickupBefore = (await t.run((ctx) => ctx.db.get(p.fix.eventId)))!;
    expect(pickupBefore.who).toEqual([m.partner]);
    await as('admin').mutation(api.proposals.decide, { proposalId: p._id, approve: true });
    expect((await t.run((ctx) => ctx.db.get(p.fix.eventId)))!.who).toEqual([m.admin]);
    const after = (await as('admin').query(api.proposals.get, { proposalId: p._id })).proposal;
    expect(after.status).toBe('approved');
    expect(after.decision).toMatchObject({ byId: m.admin, approve: true });
    expect((await t.run((ctx) => ctx.db.get(p.collisionId)))!.status).toBe('resolved');

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const coral = (await t.run((ctx) => ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m.partner)).unique()))!;
    const partnerThread = (await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m.partner)).unique()))!;
    const msgs = await t.run((ctx) => ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', partnerThread._id)).collect());
    expect(msgs.some((x) => x.body.type === 'card' && x.body.card.kind === 'proposal' && x.author.kind === 'mega' && x.author.id === coral._id)).toBe(true);
    // a second decision is refused
    expect(codeOf(await as('admin').mutation(api.proposals.decide, { proposalId: p._id, approve: true }).catch((e) => e))).toBe('VALIDATION');
    expect(byTitle).toBeDefined();
  });

  test('reject changes nothing and dismisses the clash', async () => {
    const { t, m, p, as } = await seededProposal();
    await as('admin').mutation(api.proposals.decide, { proposalId: p._id, approve: false });
    expect((await t.run((ctx) => ctx.db.get(p.fix.eventId)))!.who).toEqual([m.partner]);
    expect((await t.run((ctx) => ctx.db.get(p.collisionId)))!.status).toBe('dismissed');
  });

  test('refused (VALIDATION) when the family changed since it was proposed — OpenDuet: approvals are scoped to their audience', async () => {
    const { t, familyId, m, p, as } = await seededProposal();
    await t.run((ctx) => ctx.db.insert('members', { familyId, name: 'Grandparent', role: 'adult', activities: [], hasMega: false }));
    expect(codeOf(await as('admin').mutation(api.proposals.decide, { proposalId: p._id, approve: true }).catch((e) => e))).toBe('VALIDATION');
    expect((await t.run((ctx) => ctx.db.get(p.fix.eventId)))!.who).toEqual([m.partner]);
    await t.mutation(internal.proactive.tickFamily, { familyId });
    expect((await t.run((ctx) => ctx.db.get(p._id)))!.status).toBe('stale');
  });

  test('refused when the event changed since (its "before" no longer matches)', async () => {
    const { t, m, p, as } = await seededProposal();
    await t.run((ctx) => ctx.db.patch(p.fix.eventId, { title: 'Soccer pickup (moved)' }));
    expect(codeOf(await as('admin').mutation(api.proposals.decide, { proposalId: p._id, approve: true }).catch((e) => e))).toBe('VALIDATION');
    expect((await t.run((ctx) => ctx.db.get(p.fix.eventId)))!.who).toEqual([m.partner]);
  });

  test('refused once expired', async () => {
    const { m, p, as, t } = await seededProposal();
    process.env.DEMO_MODE = 'true';
    await as('admin').mutation(api.clock.jump, { to: p.expiresAt + 60_000 });
    delete process.env.DEMO_MODE;
    expect(codeOf(await as('admin').mutation(api.proposals.decide, { proposalId: p._id, approve: true }).catch((e) => e))).toBe('VALIDATION');
    expect((await t.run((ctx) => ctx.db.get(p.fix.eventId)))!.who).toEqual([m.partner]);
  });
});
