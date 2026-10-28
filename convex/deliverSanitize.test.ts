/// <reference types="vite/client" />
// Owner, Oct 28 (Image 17): a kid's reminder card read "Hey Twin 2! Time to return your library book - you
// can do it! ✨📚", with no headline. The row predated the draft sanitizer, but delivery wrote whatever text
// a candidate carried. Delivery is the one place every push and card passes through, so it sanitizes too.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('delivery sanitizes every draft, whatever wrote it', () => {
  test('an emoji-laden draft with two exclamation marks is delivered calm and emoji-free', async () => {
    const t = convexTest(schema, modules);
    const { familyId, members: raw } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const members = raw as unknown as Record<'admin' | 'twin2', Id<'members'>>;
    const now = Date.now();
    const candidateId = await t.run((ctx) =>
      ctx.db.insert('candidates', {
        familyId,
        recipientId: members.admin,
        kind: 'reminder',
        dedupeKey: 'sanitize-test',
        draft: { text: 'Hey! Time to return your library book - you can do it! ✨📚', title: 'Library book 📚', buttons: 'reminder.default' },
        score: 0.9,
        reason: 'test',
        delivery: 'push',
        window: { from: now, to: now + 60_000 },
        deliverAt: now,
        status: 'scheduled',
      }),
    );
    await t.mutation(internal.proactive.deliverCandidate, { candidateId });
    const notification = await t.run((ctx) => ctx.db.query('notifications').withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', members.admin)).collect()).then((rows) => rows.find((n) => n.candidateId === candidateId));
    expect(notification).toBeDefined();
    expect(notification!.body).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(notification!.title).not.toMatch(/\p{Extended_Pictographic}/u);
    expect((notification!.body.match(/!/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});
