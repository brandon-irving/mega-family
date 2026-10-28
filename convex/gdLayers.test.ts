/// <reference types="vite/client" />
// GD invariants 1 and 2 (docs/gates/GD.md): explicit share only, and private is invisible. A `personal`
// event reaches nobody but its owner — not even people in its `who` — until the owner's own share, and no
// other member, write path or answer can move it.
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: string }).code : (e as { data?: { code?: string } })?.data?.code);

async function seeded() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const byTitle = async (title: string) => (await t.run((ctx) => ctx.db.query('events').withIndex('by_family_start', (q) => q.eq('familyId', familyId)).collect())).find((e) => e.title === title)!;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  const week = { from: Date.parse('2026-10-25T00:00:00Z'), to: Date.parse('2026-11-02T00:00:00Z') };
  return { t, familyId, m, byTitle, as, week };
}

describe('GD invariant 2: private is invisible', () => {
  test("Admin's private Dentist is on Admin's calendar and nobody else's, even when someone else is in its `who`", async () => {
    const { t, m, byTitle, as, week } = await seeded();
    const dentist = await byTitle('Dentist');
    expect(dentist.scope).toBe('personal');
    await t.run((ctx) => ctx.db.patch(dentist._id, { who: [m.admin, m.partner, m.twin1] })); // naming others must not reveal it

    const titles = async (k: Key) => (await as(k).query(api.calendar.range, week)).map((e) => e.title);
    expect(await titles('admin')).toContain('Dentist');
    for (const k of ['partner', 'twin1', 'twin2'] as const) expect(await titles(k), `${k} must not see Admin's private Dentist`).not.toContain('Dentist');
    // and the other way round: Partner's private Haircut is Partner's only
    expect(await titles('partner')).toContain('Haircut');
    expect(await titles('admin')).not.toContain('Haircut');
  });

  test("another member's MEGA can't read, move or cancel a private event (the agent's event tools say 'not found')", async () => {
    const { t, familyId, m, byTitle } = await seeded();
    const dentist = await byTitle('Dentist');
    const thread = (await t.run((ctx) => ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m.partner)).unique()))!;
    for (const name of ['events_update', 'events_cancel'] as const) {
      const res = await t.mutation(internal.agent.tools.execute, { familyId, memberId: m.partner, threadId: thread._id, name, argumentsJson: JSON.stringify({ eventId: dentist._id, title: 'Moved' }) });
      expect(res.ok).toBe(false);
      expect(res.resultText).toMatch(/not found/);
    }
    const after = await byTitle('Dentist');
    expect(after.cancelled).toBe(false);
    expect(after.scope).toBe('personal');
  });

  test('events.update / .cancel on someone else’s private event is NOT_FOUND, even for the admin', async () => {
    const { byTitle, as } = await seeded();
    const haircut = await byTitle('Haircut'); // Partner's
    expect(codeOf(await as('admin').mutation(api.events.update, { eventId: haircut._id, patch: { title: 'x' } }).catch((e) => e))).toBe('NOT_FOUND');
    expect(codeOf(await as('admin').mutation(api.events.cancel, { eventId: haircut._id }).catch((e) => e))).toBe('NOT_FOUND');
  });

  test('a new personal event gets its owner set, and stays off everyone else’s calendar', async () => {
    const { as, week } = await seeded();
    const start = Date.parse('2026-10-27T15:00:00Z');
    await as('partner').mutation(api.events.create, { title: 'Therapy', start, end: start + 3_600_000, who: [], scope: 'personal' });
    expect((await as('partner').query(api.calendar.range, week)).map((e) => e.title)).toContain('Therapy');
    expect((await as('admin').query(api.calendar.range, week)).map((e) => e.title)).not.toContain('Therapy');
  });
});

describe('GD invariant 1: explicit share only', () => {
  test('only the owner can share a private event; it writes a shareActions row in the same mutation', async () => {
    const { t, familyId, m, byTitle, as } = await seeded();
    const dentist = await byTitle('Dentist');
    for (const k of ['partner', 'twin1', 'twin2'] as const) {
      const err = await as(k).mutation(api.events.share, { eventId: dentist._id }).catch((e) => e);
      expect(['NOT_FOUND', 'FORBIDDEN']).toContain(codeOf(err));
    }
    expect((await byTitle('Dentist')).scope).toBe('personal');

    await as('admin').mutation(api.events.share, { eventId: dentist._id });
    expect((await byTitle('Dentist')).scope).toBe('family');
    const actions = await t.run((ctx) => ctx.db.query('shareActions').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m.admin)).collect());
    expect(actions.some((a) => a.item.kind === 'event' && a.item.eventId === dentist._id && a.action === 'share' && a.fromScope === 'personal')).toBe(true);
  });

  test('sharing a household event is VALIDATION; unshare only by whoever shared it', async () => {
    const { byTitle, as } = await seeded();
    const practice = await byTitle('Soccer practice');
    expect(codeOf(await as('admin').mutation(api.events.share, { eventId: practice._id }).catch((e) => e))).toBe('VALIDATION');
    const dinner = await byTitle('Work dinner'); // Partner shared it
    expect(codeOf(await as('admin').mutation(api.events.unshare, { eventId: dinner._id }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await as('admin').mutation(api.events.unshare, { eventId: practice._id }).catch((e) => e))).toBe('FORBIDDEN');
    await as('partner').mutation(api.events.unshare, { eventId: dinner._id });
    expect((await byTitle('Work dinner')).scope).toBe('personal');
  });

  test("share suggestions: only the owner sees or answers one; anyone else's answer changes nothing", async () => {
    const { m, byTitle, as } = await seeded();
    const mine = await as('admin').query(api.shareSuggestions.mine, {});
    const suggestion = mine.find((s) => s.item.kind === 'event')!;
    expect(suggestion.ownerId).toBe(m.admin);
    expect(suggestion.decidedBy).toBe('rule:privateOverlapsHousehold');
    for (const k of ['partner', 'twin1'] as const) {
      expect((await as(k).query(api.shareSuggestions.mine, {})).map((s) => s._id)).not.toContain(suggestion._id);
      expect(codeOf(await as(k).query(api.shareSuggestions.get, { suggestionId: suggestion._id }).catch((e) => e))).toBe('FORBIDDEN');
      expect(codeOf(await as(k).mutation(api.shareSuggestions.answer, { suggestionId: suggestion._id, share: true }).catch((e) => e))).toBe('FORBIDDEN');
    }
    expect((await byTitle('Dentist')).scope).toBe('personal');

    await as('admin').mutation(api.shareSuggestions.answer, { suggestionId: suggestion._id, share: false });
    expect((await byTitle('Dentist')).scope).toBe('personal');
    // idempotent: a second answer (even "yes") changes nothing
    await as('admin').mutation(api.shareSuggestions.answer, { suggestionId: suggestion._id, share: true });
    expect((await byTitle('Dentist')).scope).toBe('personal');
    expect((await as('admin').query(api.shareSuggestions.get, { suggestionId: suggestion._id })).status).toBe('kept');
  });

  test("answering yes is the owner's share: the event moves and the action records the suggestion", async () => {
    const { t, familyId, m, byTitle, as } = await seeded();
    const suggestion = (await as('admin').query(api.shareSuggestions.mine, {}))[0];
    await as('admin').mutation(api.shareSuggestions.answer, { suggestionId: suggestion._id, share: true });
    expect((await byTitle('Dentist')).scope).toBe('family');
    const actions = await t.run((ctx) => ctx.db.query('shareActions').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m.admin)).collect());
    expect(actions.find((a) => a.suggestionId === suggestion._id)?.action).toBe('share');
  });

  test('no sweep, trigger or model reply changes a private scope (a full tick leaves the Dentist private)', async () => {
    const { t, familyId, byTitle } = await seeded();
    await t.mutation(internal.proactive.tickFamily, { familyId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await byTitle('Dentist')).scope).toBe('personal');
    expect((await byTitle('Haircut')).scope).toBe('personal');
  });
});
