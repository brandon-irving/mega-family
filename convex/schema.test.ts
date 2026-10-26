/// <reference types="vite/client" />
// The schema enforces the contract's config-backed values: only ids that exist in shared/config are stored.
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('config-backed values', () => {
  test('a MEGA with an unknown sticker is rejected', async () => {
    const t = convexTest(schema, modules);
    const { familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
    const megaId = await t.run(async (ctx) => (await ctx.db.query('megas').withIndex('by_family_owner', (q) => q.eq('familyId', familyId)).first())!._id);
    await expect(t.run((ctx) => ctx.db.patch(megaId, { look: { hex: '#000000', sticker: 'banana' as never } }))).rejects.toThrow();
    await t.run((ctx) => ctx.db.patch(megaId, { look: { hex: '#000000', sticker: 'star' } })); // a real one is fine
  });

  test('an unknown wallpaper preset or button set is rejected', async () => {
    const t = convexTest(schema, modules);
    const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: '2026-10-25' });
    const settingsId = await t.run(async (ctx) => (await ctx.db.query('settings').withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', members.admin)).unique())!._id);
    await expect(t.run((ctx) => ctx.db.patch(settingsId, { wallpaper: { kind: 'preset', id: 'disco' as never } }))).rejects.toThrow();
    const candidateId = await t.run(async (ctx) => (await ctx.db.query('candidates').withIndex('by_family_status', (q) => q.eq('familyId', familyId)).first())!._id);
    await expect(t.run((ctx) => ctx.db.patch(candidateId, { draft: { text: 'x', buttons: 'nope' as never } }))).rejects.toThrow();
  });
});
