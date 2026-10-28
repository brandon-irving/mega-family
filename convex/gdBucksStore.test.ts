/// <reference types="vite/client" />
// GD invariant 6 (docs/gates/GD.md): Mega Bucks and the Store. Balance = sum of ledger rows; only adults
// release, only the kid's own purchase spends; one release per practice set / chore claim; never negative,
// never bought twice; a kid wears and places only what they own; adults are unrestricted.
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
  const photo = await t.run((ctx) => ctx.storage.store(new Blob(['png'], { type: 'image/png' })));
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK, homeworkStorageId: photo });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  const ledger = (k: Key) => t.run((ctx) => ctx.db.query('bucksLedger').withIndex('by_family_member_at', (q) => q.eq('familyId', familyId).eq('memberId', m[k])).collect());
  return { t, familyId, m, as, ledger };
}

describe('GD invariant 6: the Mega Bucks ledger', () => {
  test('the seeded balance is the sum of the ledger (Twin 1: 3), and a kid sees only their own', async () => {
    const { m, as, ledger } = await seeded();
    expect((await as('twin1').query(api.bucks.balance, {})).balance).toBe(3);
    expect((await ledger('twin1')).reduce((s, r) => s + r.delta, 0)).toBe(3);
    expect((await as('admin').query(api.bucks.balance, { memberId: m.twin1 })).balance).toBe(3);
    expect(codeOf(await as('twin2').query(api.bucks.balance, { memberId: m.twin1 }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await as('twin2').query(api.bucks.history, { memberId: m.twin1, paginationOpts: { numItems: 10, cursor: null } }).catch((e) => e))).toBe('FORBIDDEN');
  });

  test('only adults release; amounts are bounded; a practice set releases once (idempotent)', async () => {
    const { t, familyId, as, ledger } = await seeded();
    const set = (await t.run((ctx) => ctx.db.query('practiceSets').withIndex('by_family_for', (q) => q.eq('familyId', familyId)).collect())).find((s) => s.status === 'done')!;
    expect(codeOf(await as('twin1').mutation(api.bucks.release, { source: { kind: 'practice', setId: set._id }, amount: 5 }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await as('admin').mutation(api.bucks.release, { source: { kind: 'practice', setId: set._id }, amount: 500 }).catch((e) => e))).toBe('VALIDATION');
    expect(codeOf(await as('admin').mutation(api.bucks.release, { source: { kind: 'practice', setId: set._id }, amount: 2.5 }).catch((e) => e))).toBe('VALIDATION');
    const first = await as('admin').mutation(api.bucks.release, { source: { kind: 'practice', setId: set._id }, amount: 5 });
    const second = await as('partner').mutation(api.bucks.release, { source: { kind: 'practice', setId: set._id }, amount: 5 });
    expect(second).toEqual(first);
    expect(first.balance).toBe(8);
    expect((await ledger('twin1')).filter((r) => r.source.kind === 'practice')).toHaveLength(1);
    const view = await as('admin').query(api.practice.get, { setId: set._id });
    expect(view.released).toMatchObject({ amount: 5 });
  });

  test('a claimed chore is approved by its release (once); an unclaimed one cannot be paid', async () => {
    const { t, familyId, m, as, ledger } = await seeded();
    const claim = (await t.run((ctx) => ctx.db.query('choreClaims').withIndex('by_family_status', (q) => q.eq('familyId', familyId).eq('status', 'claimed')).collect()))[0];
    const r = await as('partner').mutation(api.bucks.release, { source: { kind: 'chore', claimId: claim._id }, amount: 3 });
    expect((await t.run((ctx) => ctx.db.get(claim._id)))!.status).toBe('approved');
    expect((await as('partner').mutation(api.bucks.release, { source: { kind: 'chore', claimId: claim._id }, amount: 3 })).ledgerId).toBe(r.ledgerId);
    expect((await ledger('twin2')).filter((x) => x.source.kind === 'chore')).toHaveLength(1);

    const fish = (await as('twin1').query(api.chores.list, {})).find((c) => c.chore.title === 'Feed the fish')!.chore;
    const dueId = await t.run((ctx) => ctx.db.insert('choreClaims', { familyId, choreId: fish._id, forMemberId: m.twin1, date: '2026-10-24', status: 'due' }));
    expect(codeOf(await as('admin').mutation(api.bucks.release, { source: { kind: 'chore', claimId: dueId }, amount: 3 }).catch((e) => e))).toBe('VALIDATION');
  });
});

describe('GD invariant 6: the Store', () => {
  test('kids only; short balance or already owned is refused and nothing is written', async () => {
    const { as, ledger } = await seeded();
    expect(codeOf(await as('admin').query(api.store.catalog, {}).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await as('admin').mutation(api.store.buy, { itemId: 'eyes:anime' }).catch((e) => e))).toBe('FORBIDDEN');
    const cat = await as('twin1').query(api.store.catalog, {});
    expect(cat.balance).toBe(3);
    expect(cat.items.find((i) => i.id === 'furniture:plant')?.owned).toBe(true);
    expect(cat.items.find((i) => i.id === 'furniture:bed')?.owned).toBe(true); // free starter set
    expect(cat.items.find((i) => i.id === 'sticker:bolt')).toMatchObject({ owned: true, wearing: true }); // Zap's own sticker
    const before = (await ledger('twin1')).length;
    expect(codeOf(await as('twin1').mutation(api.store.buy, { itemId: 'eyes:anime' }).catch((e) => e))).toBe('VALIDATION');
    expect(codeOf(await as('twin1').mutation(api.store.buy, { itemId: 'furniture:plant' }).catch((e) => e))).toBe('VALIDATION');
    expect((await ledger('twin1')).length).toBe(before);
  });

  test('a purchase and its spend are one write; the balance never goes negative; no buying twice', async () => {
    const { m, as, ledger } = await seeded();
    await as('admin').mutation(api.bucks.release, { source: { kind: 'bonus', memberId: m.twin1 }, amount: 12 });
    const r = await as('twin1').mutation(api.store.buy, { itemId: 'eyes:anime' });
    expect(r.balance).toBe(0);
    const rows = await ledger('twin1');
    expect(rows.find((x) => x.source.kind === 'purchase' && x.source.purchaseId === r.purchaseId)?.delta).toBe(-15);
    expect(rows.reduce((s, x) => s + x.delta, 0)).toBe(0);
    expect(codeOf(await as('twin1').mutation(api.store.buy, { itemId: 'eyes:anime' }).catch((e) => e))).toBe('VALIDATION');
  });

  test('a kid wears only owned look parts and places only owned furniture; adults are unrestricted', async () => {
    const { m, as } = await seeded();
    const zap = (await as('twin1').query(api.megas.mine, {}))!;
    const look = zap.look;
    expect(codeOf(await as('twin1').mutation(api.megas.update, { look: { ...look, antenna: 'star' } }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await as('twin1').mutation(api.megas.update, { look: { ...look, hex: '#F28AC0' } }).catch((e) => e))).toBe('FORBIDDEN'); // store-only Bubblegum
    await as('twin1').mutation(api.megas.update, { look: { ...look, hex: '#2FB8B0' } }); // a free preset color
    await as('admin').mutation(api.bucks.release, { source: { kind: 'bonus', memberId: m.twin1 }, amount: 12 });
    await as('twin1').mutation(api.store.buy, { itemId: 'antenna:star' });
    await as('twin1').mutation(api.megas.update, { look: { ...look, hex: '#2FB8B0', antenna: 'star' } });
    // adults: anything
    const teal = (await as('admin').query(api.megas.mine, {}))!;
    await as('admin').mutation(api.megas.update, { look: { ...teal.look, antenna: 'sprout', eyes: 'anime', hex: '#F28AC0' } });

    expect(codeOf(await as('twin1').mutation(api.rooms.update, { furniture: [{ kind: 'beanbag', x: 1, y: 1 }] }).catch((e) => e))).toBe('FORBIDDEN');
    await as('twin1').mutation(api.rooms.update, { furniture: [{ kind: 'plant', x: 1, y: 1 }, { kind: 'bed', x: 2, y: 2 }] });
    await as('admin').mutation(api.rooms.update, { furniture: [{ kind: 'beanbag', x: 1, y: 1 }] });
  });
});

describe('GD integration: what a kid starts with stays theirs', () => {
  test('switching away from the starting sticker and back never asks to buy it', async () => {
    const { as } = await seeded();
    const zap = (await as('twin1').query(api.megas.mine, {}))!;
    expect(zap.look.sticker).not.toBe('none');
    await as('twin1').mutation(api.megas.update, { look: { ...zap.look, sticker: 'none' } });
    await as('twin1').mutation(api.megas.update, { look: { ...zap.look } }); // back to the starting sticker
    expect((await as('twin1').query(api.megas.mine, {}))!.look.sticker).toBe(zap.look.sticker);
  });

  test('furniture a kid’s room started with can be put away and placed again', async () => {
    const { t, familyId, m, as } = await seeded();
    const room = await t.run((ctx) => ctx.db.query('rooms').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m.twin1)).first());
    expect(room).not.toBeNull();
    // A room that started with a Store-only piece the kid never bought (a made-for-you starting room).
    await t.run((ctx) => ctx.db.patch(room!._id, { furniture: [...room!.furniture, { kind: 'beanbag', x: 3, y: 3 }] }));
    const start = [...room!.furniture, { kind: 'beanbag', x: 3, y: 3 }];
    await as('twin1').mutation(api.rooms.update, { furniture: [] });
    await as('twin1').mutation(api.rooms.update, { furniture: start.map((f) => ({ kind: f.kind, x: f.x, y: f.y })) });
  });
});

describe('GD addenda (frontend requests): one ledger row by id, the family MEGA badge', () => {
  test('bucks.entry: a kid reads only their own rows; adults any kid’s', async () => {
    const { as, ledger } = await seeded();
    const row = (await ledger('twin1'))[0];
    expect((await as('twin1').query(api.bucks.entry, { ledgerId: row._id }))._id).toBe(row._id);
    expect((await as('partner').query(api.bucks.entry, { ledgerId: row._id }))._id).toBe(row._id);
    expect(codeOf(await as('twin2').query(api.bucks.entry, { ledgerId: row._id }).catch((e) => e))).toBe('FORBIDDEN');
  });

  test('megas.family returns Hub for any member', async () => {
    const { as } = await seeded();
    expect((await as('twin2').query(api.megas.family, {})).name).toBe('Hub');
  });
});
