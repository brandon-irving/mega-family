/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { SAMPLE_FAMILY, type SampleKey } from '../shared/fixtures/sampleFamily';
import { TABLES } from '../shared/domain/tables';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { parseScopeKey } from './model/scopes';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25'; // the mockups' week (a Sunday)

// Explicit return type: with dozens of functions now in the API, TS's inference through an unannotated
// async wrapper around `internal.seed.sampleFamily`'s FunctionReference can silently degrade to `any`
// (no error, just every `t.run((ctx) => ...)` callback losing its contextual typing). Annotating `r`
// keeps that resolution local and cheap instead of forcing it through the whole generated `internal` type.
async function seeded(): Promise<{ t: ReturnType<typeof convexTest<typeof schema.tables>>; familyId: Id<'families'>; members: Record<SampleKey, Id<'members'>> }> {
  const t = convexTest(schema, modules);
  const r: { familyId: Id<'families'>; members: Record<SampleKey, Id<'members'>> } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return { t, ...r };
}

describe('seed.sampleFamily', () => {
  test('creates the five sample members, with generic labels only', async () => {
    const { t, familyId } = await seeded();
    const members = await t.run((ctx) => ctx.db.query('members').withIndex('by_family', (q) => q.eq('familyId', familyId)).collect());
    expect(members.map((m) => m.name)).toEqual(['Admin', 'Partner', 'Twin 1', 'Twin 2', 'Toddler']);
    expect(members.find((m) => m.name === 'Toddler')!.authId).toBeUndefined();
  });

  test('puts the mockup events at the right local times (Soccer pickup Sunday 4:50 PM New York)', async () => {
    const { t, familyId } = await seeded();
    const events = await t.run((ctx) => ctx.db.query('events').withIndex('by_family_start', (q) => q.eq('familyId', familyId)).collect());
    expect(events).toHaveLength(SAMPLE_FAMILY.events.length + SAMPLE_FAMILY.gd.events.length + 1); // + G5's found "Picture day" (Admin's private layer)
    expect(new Date(events[0].start).toISOString()).toBe('2026-10-25T20:50:00.000Z');
    expect(events[0].title).toBe('Soccer pickup');
  });

  test('starts the demo clock at Sunday 4:42 PM local time', async () => {
    const { t, familyId } = await seeded();
    const clock = await t.run((ctx) => ctx.db.query('clocks').withIndex('by_family', (q) => q.eq('familyId', familyId)).unique());
    const demoNow = Date.now() + clock!.offsetMs;
    expect(Math.abs(demoNow - Date.parse('2026-10-25T20:42:00.000Z'))).toBeLessThan(5_000);
  });

  test('has memories in every scope, each with a scope key for this family that matches its scope', async () => {
    const { t, familyId, members } = await seeded();
    const memories = await t.run((ctx) => ctx.db.query('memories').collect());
    expect(new Set(memories.map((m) => m.scope))).toEqual(new Set(['family', 'adults', 'personal', 'shared']));
    for (const m of memories) {
      expect(parseScopeKey(familyId, m.scopeKey), m.text).toBe(m.scope);
      if (m.scope === 'personal') expect(Object.values(members)).toContain(m.scopeKey.split(':')[2] as Id<'members'>);
    }
  });

  test('every document belongs to its family, and seeding twice creates two separate families', async () => {
    const t = convexTest(schema, modules);
    const a = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const b = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    expect(a.familyId).not.toBe(b.familyId);
    await t.run(async (ctx) => {
      // every id stored in a family's documents points at a document of the same family
      const owner = new Map<string, string>();
      for (const table of Object.keys(TABLES) as (keyof typeof TABLES)[]) {
        for (const doc of await ctx.db.query(table).collect()) owner.set(doc._id, table === 'families' ? doc._id : (doc as { familyId: string }).familyId);
      }
      const refs = (value: unknown, out: string[] = []): string[] => {
        if (typeof value === 'string' && owner.has(value)) out.push(value);
        else if (Array.isArray(value)) value.forEach((x) => refs(x, out));
        else if (value && typeof value === 'object') Object.values(value).forEach((x) => refs(x, out));
        return out;
      };
      let checked = 0;
      for (const table of Object.keys(TABLES) as (keyof typeof TABLES)[]) {
        if (table === 'families') continue;
        for (const doc of await ctx.db.query(table).collect()) {
          const { _id, ...rest } = doc;
          const fam = (doc as { familyId: string }).familyId;
          for (const ref of refs(rest)) {
            expect(owner.get(ref), `${table} ${_id} → ${ref}`).toBe(fam);
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(200);
    });
  });

  test('the open milk request has its push and its card in the admin thread', async () => {
    const { t, members } = await seeded();
    await t.run(async (ctx) => {
      const req = (await ctx.db.query('requests').collect())[0];
      expect(req.toMemberId).toBe(members.admin);
      const n = (await ctx.db.get(req.notificationId!))!;
      expect(n.buttons.map((b) => b.id)).toEqual(['yes', 'cant']);
      const msg = (await ctx.db.get(n.messageId!))!;
      expect(msg.body).toEqual({ type: 'card', card: { kind: 'notification', notificationId: n._id } });
    });
  });

  test("a twin's reminder is held until kid quiet hours end the next morning", async () => {
    const { t } = await seeded();
    const held = await t.run(async (ctx) => (await ctx.db.query('notifications').collect()).find((n) => n.heldUntil));
    expect(new Date(held!.heldUntil!).toISOString()).toBe('2026-10-26T11:00:00.000Z'); // 7:00 AM New York
  });
});
