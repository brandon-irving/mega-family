/// <reference types="vite/client" />
// Milestone C. Real OAuth/anonymous flows can't run in convex-test (no browser, no Apple/Google servers,
// no HTTP router) — PLAN.md → Sign-in says as much ("Don't try to run real OAuth in tests"). What *can* be
// tested without a deployment is everything downstream of a session existing: that `ctx.auth.getUserIdentity()`
// resolves to a `members` row via `by_authId` (`t.withIdentity({ subject })`, matching seed.ts's
// `sample:<key>` authIds), that `invites.create`/`.redeem` correctly link a brand-new identity to an
// existing unjoined member (the kid-without-Apple/Google path reuses this same redeem code — see
// convex/auth.ts's docstring for why that's the `anonymous` plugin rather than a custom endpoint), and
// that `clock.jump`'s DEMO_MODE gate actually gates.
import { ConvexError } from 'convex/values';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

async function seeded() {
  const t = convexTest(schema, modules);
  const r = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  return { t, ...r };
}

function code(err: unknown): string | undefined {
  // convex-test surfaces a thrown ConvexError's `.data` on the error it rejects with.
  const data = (err as ConvexError<{ code?: string }> | undefined)?.data ?? (err as { data?: { code?: string } } | undefined)?.data;
  return data?.code;
}

describe('me.get: identity -> members row', () => {
  test('a seeded sample authId resolves to that member', async () => {
    const { t } = await seeded();
    const viewer = await t.withIdentity({ subject: 'sample:admin' }).query(api.me.get, {});
    expect(viewer?.member.name).toBe('Admin');
    expect(viewer?.member.role).toBe('admin');
  });

  test('an unauthenticated caller gets null, not an error', async () => {
    const { t } = await seeded();
    expect(await t.query(api.me.get, {})).toBeNull();
  });

  test('a signed-in identity with no members row gets null from me.get...', async () => {
    const { t } = await seeded();
    expect(await t.withIdentity({ subject: 'nobody-has-joined-yet' }).query(api.me.get, {})).toBeNull();
  });

  test('...but throws NOT_A_MEMBER (not a generic crash) from a function that requires a viewer', async () => {
    const { t } = await seeded();
    const err = await t
      .withIdentity({ subject: 'nobody-has-joined-yet' })
      .query(api.family.members, {})
      .catch((e) => e);
    expect(code(err)).toBe('NOT_A_MEMBER');
  });
});

describe('invites.create / .redeem', () => {
  async function withUnjoinedKid() {
    const { t, familyId, members } = await seeded();
    const kidId: Id<'members'> = await t.run((ctx) =>
      ctx.db.insert('members', { familyId, name: 'New Kid', role: 'kid', activities: [], hasMega: false }),
    );
    await t.run((ctx) => ctx.db.insert('relationships', { familyId, from: members.admin, to: kidId, kind: 'parent' }));
    // A real "add a family member" flow (not built in G1 — see invites.ts's docstring) would also create
    // this; `buildViewerFromMember` requires it, so the fixture adds it directly.
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
    return { t, familyId, members, kidId };
  }

  test('a parent can create an invite for their own unjoined kid', async () => {
    const { t, kidId } = await withUnjoinedKid();
    const { url, expiresAt } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.invites.create, { memberId: kidId });
    expect(url).toContain('mega://join/');
    // Expiry is measured on the family's Clock (the demo clock is pinned to the seed week), not the wall clock,
    // so ask the app itself: a fresh invite previews as valid, and it expires `ttlHours` after it was made.
    const preview = await t.query(api.invites.preview, { token: url.split('/').pop()! });
    expect(preview.status).toBe('ok');
    const row = await t.run((ctx) => ctx.db.query('invites').order('desc').first());
    expect(row!.expiresAt).toBe(expiresAt);
  });

  test("a non-parent, non-admin member can't create an invite for someone else's kid", async () => {
    const { t, kidId } = await withUnjoinedKid();
    const err = await t
      .withIdentity({ subject: 'sample:twin1' })
      .mutation(api.invites.create, { memberId: kidId })
      .catch((e) => e);
    expect(code(err)).toBe('FORBIDDEN');
  });

  test('redeeming with the right parent code links the new identity to that member', async () => {
    const { t, familyId, kidId } = await withUnjoinedKid();
    const { url } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.invites.create, { memberId: kidId });
    const token = url.split('/').pop()!;
    const family = await t.run((ctx) => ctx.db.get(familyId));

    const { memberId } = await t.withIdentity({ subject: 'new-kid-device' }).action(api.invites.redeem, { token, parentCode: family!.parentCode });
    expect(memberId).toBe(kidId);

    const viewer = await t.withIdentity({ subject: 'new-kid-device' }).query(api.me.get, {});
    expect(viewer?.member._id).toBe(kidId);
  });

  test('the wrong parent code is rejected', async () => {
    const { t, kidId } = await withUnjoinedKid();
    const { url } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.invites.create, { memberId: kidId });
    const token = url.split('/').pop()!;
    const err = await t
      .withIdentity({ subject: 'new-kid-device' })
      .action(api.invites.redeem, { token, parentCode: '00000' })
      .catch((e) => e);
    expect(code(err)).toBe('WRONG_PARENT_CODE');
  });

  test('an unknown token is INVALID_INVITE, not a crash', async () => {
    const { t } = await seeded();
    const err = await t
      .withIdentity({ subject: 'new-kid-device' })
      .action(api.invites.redeem, { token: 'not-a-real-token' })
      .catch((e) => e);
    expect(code(err)).toBe('INVALID_INVITE');
  });
});

describe('clock.jump: DEMO_MODE gate', () => {
  afterEach(() => {
    delete process.env.DEMO_MODE;
  });

  test('is forbidden with DEMO_MODE unset', async () => {
    const { t } = await seeded();
    delete process.env.DEMO_MODE;
    const err = await t
      .withIdentity({ subject: 'sample:admin' })
      .mutation(api.clock.jump, { to: Date.now() + 1000 })
      .catch((e) => e);
    expect(code(err)).toBe('FORBIDDEN');
  });

  test('works once DEMO_MODE=true, and is still admin-only', async () => {
    const { t } = await seeded();
    process.env.DEMO_MODE = 'true';
    await t.withIdentity({ subject: 'sample:admin' }).mutation(api.clock.jump, { to: Date.now() + 60_000 });

    const err = await t
      .withIdentity({ subject: 'sample:partner' })
      .mutation(api.clock.jump, { to: Date.now() + 60_000 })
      .catch((e) => e);
    expect(code(err)).toBe('FORBIDDEN');
  });
});

describe('Sign in with Apple options', () => {
  afterEach(() => {
    delete process.env.APPLE_CLIENT_SECRET;
    delete process.env.APPLE_CLIENT_ID;
  });

  test('the client secret comes from APPLE_CLIENT_SECRET (signed by secrets sync-convex), never an empty startup cache', async () => {
    process.env.APPLE_CLIENT_ID = 'com.example.mega.web';
    process.env.APPLE_CLIENT_SECRET = 'header.payload.signature';
    const { appleOptions } = await import('./auth');
    expect(appleOptions()).toMatchObject({ clientId: 'com.example.mega.web', clientSecret: 'header.payload.signature' });
  });
});
