/// <reference types="vite/client" />
// G1 security fix: `invites.redeem` compared the 5-digit parent code with no attempt limit — 100,000
// combinations is a brute-forceable keyspace with no backoff. `invites.failedAttempts` (additive,
// CONTRACT.md v0.4) counts wrong guesses per invite; once it reaches LIMITS.maxParentCodeAttempts the
// invite is locked (RATE_LIMITED) even for the *correct* code — the admin creates a fresh invite
// (`invites.create`) to unlock, rather than this needing its own "unlock" endpoint to guard separately.
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { LIMITS } from '../shared/config';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

function code(err: unknown): string | undefined {
  const data = (err as { data?: { code?: string } } | undefined)?.data;
  return data?.code;
}

async function withUnjoinedKid() {
  const t = convexTest(schema, modules);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const kidId: Id<'members'> = await t.run((ctx) => ctx.db.insert('members', { familyId, name: 'New Kid', role: 'kid', activities: [], hasMega: false }));
  await t.run((ctx) => ctx.db.insert('relationships', { familyId, from: members.admin, to: kidId, kind: 'parent' }));
  await t.run((ctx) =>
    ctx.db.insert('settings', {
      familyId,
      memberId: kidId,
      theme: 'midnight',
      accent: 'mega',
      wallpaper: null,
      notify: { loudKinds: ['reminder'], quietHours: { start: '20:30', end: '07:00' }, dailyCap: 4 },
      pushTokens: [],
    }),
  );
  const { url } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.invites.create, { memberId: kidId });
  const token = url.split('/').pop()!;
  const family = await t.run((ctx) => ctx.db.get(familyId));
  return { t, familyId, kidId, token, parentCode: family!.parentCode };
}

describe('invites.redeem: parent code lockout', () => {
  test(`locks the invite RATE_LIMITED after ${LIMITS.maxParentCodeAttempts} wrong codes`, async () => {
    const { t, token } = await withUnjoinedKid();
    const trying = t.withIdentity({ subject: 'device-trying' });
    for (let i = 0; i < LIMITS.maxParentCodeAttempts; i++) {
      const err = await trying.action(api.invites.redeem, { token, parentCode: '00000' }).catch((e) => e);
      expect(code(err)).toBe('WRONG_PARENT_CODE');
    }
    const lockedErr = await trying.action(api.invites.redeem, { token, parentCode: '00000' }).catch((e) => e);
    expect(code(lockedErr)).toBe('RATE_LIMITED');
  });

  test('the right code no longer works once the invite is locked', async () => {
    const { t, token, parentCode } = await withUnjoinedKid();
    const trying = t.withIdentity({ subject: 'device-trying' });
    for (let i = 0; i < LIMITS.maxParentCodeAttempts; i++) {
      await trying.action(api.invites.redeem, { token, parentCode: '00000' }).catch(() => {});
    }
    const err = await t
      .withIdentity({ subject: 'device-correct-too-late' })
      .action(api.invites.redeem, { token, parentCode })
      .catch((e) => e);
    expect(code(err)).toBe('RATE_LIMITED');
  });

  test('a fresh invite for the same kid still works normally after the old one is locked', async () => {
    const { t, familyId, kidId, token } = await withUnjoinedKid();
    const trying = t.withIdentity({ subject: 'device-trying' });
    for (let i = 0; i < LIMITS.maxParentCodeAttempts; i++) {
      await trying.action(api.invites.redeem, { token, parentCode: '00000' }).catch(() => {});
    }
    // the kid's member row was never claimed (every attempt failed), so invites.create's "already
    // joined" check (which only looks at member.authId) doesn't block a brand-new invite for them.
    const { url } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.invites.create, { memberId: kidId });
    const newToken = url.split('/').pop()!;
    const family = await t.run((ctx) => ctx.db.get(familyId));
    const { memberId } = await t.withIdentity({ subject: 'device-fresh' }).action(api.invites.redeem, { token: newToken, parentCode: family!.parentCode });
    expect(memberId).toBe(kidId);
  });
});
