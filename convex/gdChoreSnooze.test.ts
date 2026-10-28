/// <reference types="vite/client" />
// CONTRACT v0.14a (GD review, UX): the chore card's "In 10 min" button. `chores.snooze` is the same re-remind
// the push's snooze_10 button does (model/chores.ts `snoozeChoreReminder`): the kid's own due chore only,
// reminded again after CHORES.snoozeMinutes through the normal timing pipeline (quiet hours, caps).
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CHORES } from '../shared/config/kids';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { clock } from './ports/clock';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2' | 'toddler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const codeOf = (e: unknown) => (e as { data?: { code?: string } } | undefined)?.data?.code;

async function seededDueChore() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const now = await t.run((ctx) => clock.now(ctx, familyId));
  const family = await t.run((ctx) => ctx.db.get(familyId));
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: family!.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const choreId = await t.run((ctx) =>
    ctx.db.insert('chores', { familyId, forMemberId: m.twin2, title: 'Feed the fish', bucks: 3, days: [0, 1, 2, 3, 4, 5, 6], time: '00:00', createdBy: m.admin, active: true }),
  );
  await t.run((ctx) => ctx.db.insert('choreClaims', { familyId, choreId, forMemberId: m.twin2, date, status: 'due' }));
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  return { t, familyId, m, now, choreId, as };
}

describe('chores.snooze (v0.14a)', () => {
  test('the kid snoozes their own due chore: remindAt is now + snoozeMinutes and a reminder is queued for then', async () => {
    const { t, familyId, m, now, choreId, as } = await seededDueChore();
    const { remindAt } = await as('twin2').mutation(api.chores.snooze, { choreId });
    const snoozedFrom = remindAt - CHORES.snoozeMinutes * 60_000; // the mutation's own clock reading
    expect(snoozedFrom).toBeGreaterThanOrEqual(now);
    expect(snoozedFrom - now).toBeLessThan(1000);
    const queued = await t.run((ctx) => ctx.db.query('candidates').withIndex('by_family_dedupeKey', (q) => q.eq('familyId', familyId)).collect());
    expect(queued.some((c) => c.recipientId === m.twin2 && c.source?.kind === 'chore' && c.window.from >= remindAt)).toBe(true);
  });

  test("another kid can't snooze it, and neither can an adult", async () => {
    const { choreId, as } = await seededDueChore();
    expect(codeOf(await as('twin1').mutation(api.chores.snooze, { choreId }).catch((e) => e))).toBe('FORBIDDEN');
    expect(codeOf(await as('admin').mutation(api.chores.snooze, { choreId }).catch((e) => e))).toBe('FORBIDDEN');
  });

  test('a chore already marked done is not snoozed', async () => {
    const { choreId, as } = await seededDueChore();
    await as('twin2').mutation(api.chores.markDone, { choreId });
    expect(codeOf(await as('twin2').mutation(api.chores.snooze, { choreId }).catch((e) => e))).toBe('VALIDATION');
  });
});
