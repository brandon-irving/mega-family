/// <reference types="vite/client" />
// Screen 9 redesign (owner, Oct 28): adults and kids get different invite screens, chosen from the invite
// itself, and the MEGA the admin set for the person comes with the invite. Adults can keep it or change it
// when they join; kids can't change it. `invites.preview` is what the join screen reads before anyone is a
// member, so it must never hand out ids, the parent code, or anything beyond the invite card's contents.
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { LIMITS } from '../shared/config';
import { COLORS } from '../shared/config/looks';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

function code(err: unknown): string | undefined {
  return (err as { data?: { code?: string } } | undefined)?.data?.code;
}

const MEGA = { name: 'Maple', look: { hex: COLORS.leaf, sticker: 'star' as const }, personality: 'cheerful' as const };

async function familyWith(role: 'adult' | 'kid', mega?: typeof MEGA) {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const memberId: Id<'members'> = await t.run((ctx) => ctx.db.insert('members', { familyId, name: role === 'kid' ? 'New Kid' : 'Grandparent', role, activities: [], hasMega: false }));
  if (role === 'kid') await t.run((ctx) => ctx.db.insert('relationships', { familyId, from: members.admin, to: memberId, kind: 'parent' }));
  const admin = t.withIdentity({ subject: 'sample:admin' });
  const { url } = await admin.mutation(api.invites.create, { memberId, mega });
  const token = url.split('/').pop()!;
  const family = await t.run((ctx) => ctx.db.get(familyId));
  const patchInvite = (patch: { expiresAt?: number; failedAttempts?: number }) =>
    t.run(async (ctx) => {
      const inv = await ctx.db.query('invites').withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', memberId)).first();
      await ctx.db.patch(inv!._id, patch);
    });
  const megasOf = () => t.run((ctx) => ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', memberId)).collect());
  return { t, familyId, memberId, token, parentCode: family!.parentCode, patchInvite, megasOf };
}

describe('invites.preview', () => {
  test('an adult invite shows kind, who invited, the default MEGA the admin set, and who is already here', async () => {
    const { t, token } = await familyWith('adult', MEGA);
    const p = await t.withIdentity({ subject: 'anon-device' }).query(api.invites.preview, { token });
    expect(p.status).toBe('ok');
    if (p.status !== 'ok') return;
    expect(p.kind).toBe('adult');
    expect(p.inviterName).toBe('Admin');
    expect(p.mega).toEqual({ name: 'Maple', look: { hex: COLORS.leaf, sticker: 'star' }, personality: 'cheerful' });
    // "Already here": joined members only, by name and MEGA badge.
    const names = p.family.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['Admin', 'Partner', 'Twin 1', 'Twin 2']));
    expect(names).not.toContain('Grandparent');
  });

  test('a kid invite is kind "kid"', async () => {
    const { t, token } = await familyWith('kid');
    const p = await t.query(api.invites.preview, { token });
    expect(p.status === 'ok' && p.kind).toBe('kid');
  });

  test('without a MEGA from the admin, the invite still carries a default one (a preset color and a name)', async () => {
    const { t, token } = await familyWith('kid');
    const p = await t.query(api.invites.preview, { token });
    if (p.status !== 'ok') throw new Error('expected ok');
    expect(Object.values(COLORS)).toContain(p.mega.look.hex);
    expect(p.mega.name.trim().length).toBeGreaterThan(0);
  });

  test('never leaks ids, the parent code or the token hash (works signed out too)', async () => {
    const { t, token, parentCode } = await familyWith('kid');
    const p = await t.query(api.invites.preview, { token });
    const json = JSON.stringify(p);
    expect(json).not.toContain(parentCode);
    expect(json).not.toMatch(/"_id"|familyId|memberId|tokenHash/);
  });

  test('an unknown token is "invalid"; a locked one is "locked"; an expired one is "expired"', async () => {
    const { t, token, patchInvite } = await familyWith('kid');
    expect((await t.query(api.invites.preview, { token: 'nope' })).status).toBe('invalid');

    await patchInvite({ failedAttempts: LIMITS.maxParentCodeAttempts });
    expect((await t.query(api.invites.preview, { token })).status).toBe('locked');

    await patchInvite({ expiresAt: 1, failedAttempts: 0 });
    const expired = await t.query(api.invites.preview, { token });
    expect(expired.status).toBe('expired');
    expect(expired.status === 'expired' && expired.inviterName).toBe('Admin');
  });
});

describe('invites.redeem: the MEGA comes with the invite', () => {
  test('an adult who keeps it gets exactly the MEGA the admin set', async () => {
    const { t, memberId, token, megasOf } = await familyWith('adult', MEGA);
    await t.withIdentity({ subject: 'new-adult' }).action(api.invites.redeem, { token });
    const mine = await megasOf();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: 'Maple', kind: 'member', look: { hex: COLORS.leaf, sticker: 'star' }, personality: 'cheerful' });
    expect((await t.run((ctx) => ctx.db.get(memberId)))!.hasMega).toBe(true);
  });

  test('an adult can change it on join', async () => {
    const { t, token, megasOf } = await familyWith('adult', MEGA);
    const mega = { name: 'Ember', look: { hex: COLORS.coral, sticker: 'heart' as const }, personality: 'funny' as const };
    await t.withIdentity({ subject: 'new-adult' }).action(api.invites.redeem, { token, mega });
    expect((await megasOf())[0]).toMatchObject({ name: 'Ember', look: { hex: COLORS.coral, sticker: 'heart' }, personality: 'funny' });
  });

  test("a kid can't change it (FORBIDDEN), and the invite isn't used up by trying", async () => {
    const { t, memberId, token, parentCode, megasOf } = await familyWith('kid');
    const err = await t
      .withIdentity({ subject: 'kid-device' })
      .action(api.invites.redeem, { token, parentCode, mega: MEGA })
      .catch((e) => e);
    expect(code(err)).toBe('FORBIDDEN');
    expect((await t.run((ctx) => ctx.db.get(memberId)))!.authId).toBeUndefined();
    await t.withIdentity({ subject: 'kid-device' }).action(api.invites.redeem, { token, parentCode });
    expect(await megasOf()).toHaveLength(1);
  });

  test('a bad look is rejected (VALIDATION): not a hex color, or an empty name', async () => {
    const { t, token } = await familyWith('adult', MEGA);
    const bad1 = await t.withIdentity({ subject: 'a' }).action(api.invites.redeem, { token, mega: { ...MEGA, look: { hex: 'red', sticker: 'star' } } }).catch((e) => e);
    expect(code(bad1)).toBe('VALIDATION');
    const bad2 = await t.withIdentity({ subject: 'a' }).action(api.invites.redeem, { token, mega: { ...MEGA, name: '   ' } }).catch((e) => e);
    expect(code(bad2)).toBe('VALIDATION');
  });

  test('seed.sampleInvites (demo only): an unjoined adult and kid, one invite each, reused on a rerun', async () => {
    const t = convexTest(schema, modules);
    process.env.DEMO_MODE = 'true';
    try {
      await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
      const { adultUrl, kidUrl } = await t.mutation(internal.seed.sampleInvites, {});
      const adult = await t.query(api.invites.preview, { token: adultUrl.split('/').pop()! });
      const kid = await t.query(api.invites.preview, { token: kidUrl.split('/').pop()! });
      expect(adult.status === 'ok' && adult.kind).toBe('adult');
      expect(kid.status === 'ok' && kid.kind).toBe('kid');
      await t.mutation(internal.seed.sampleInvites, {});
      const names = (await t.run((ctx) => ctx.db.query('members').collect())).map((m) => m.name);
      expect(names.filter((n) => n === 'Grandparent')).toHaveLength(1);
    } finally {
      delete process.env.DEMO_MODE;
    }
  });

  test('a member who already has a MEGA keeps that one row (patched on change, never duplicated)', async () => {
    const t = convexTest(schema, modules);
    const { familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const memberId: Id<'members'> = await t.run((ctx) => ctx.db.insert('members', { familyId, name: 'Grandparent', role: 'adult', activities: [], hasMega: true }));
    await t.run((ctx) =>
      ctx.db.insert('megas', { familyId, kind: 'member', ownerId: memberId, name: 'Old', look: { hex: COLORS.sun, sticker: 'none' }, personality: 'calm', job: { station: 'charger', label: 'Resting', busy: false, since: 0 } }),
    );
    const { url } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.invites.create, { memberId });
    const token = url.split('/').pop()!;
    const p = await t.query(api.invites.preview, { token });
    expect(p.status === 'ok' && p.mega.name).toBe('Old');
    await t.withIdentity({ subject: 'gp' }).action(api.invites.redeem, { token, mega: { ...MEGA, name: 'New' } });
    const mine = await t.run((ctx) => ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', memberId)).collect());
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe('New');
  });
});
