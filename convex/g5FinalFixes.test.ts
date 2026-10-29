/// <reference types="vite/client" />
// G5 last fixes (CONTRACT v0.17b), each written to fail before its fix: the invite QR carries the full join
// link (so the phone's own camera opens MEGA) and preview/redeem accept either the link or the bare token; and
// Activity's "who decided" names the person (`member:<id>`), never a bare guess. Synthetic data only.
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { LINKS } from '../shared/domain/api';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

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
  return { t, familyId, members, kidId };
}

describe('invite QR payload', () => {
  test('qrPayload is the full join link (same as url), so the system camera opens the app', async () => {
    const { t, kidId } = await withUnjoinedKid();
    const r = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.invites.create, { memberId: kidId });
    expect(r.qrPayload).toBe(r.url);
    expect(r.qrPayload.startsWith(LINKS.join(''))).toBe(true);
  });

  test('preview accepts the full link, a link with a trailing slash or query, and the bare token', async () => {
    const { t, kidId } = await withUnjoinedKid();
    const { url } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.invites.create, { memberId: kidId });
    const token = url.split('/').pop()!;
    for (const input of [url, `${url}/`, `${url}?src=qr`, ` ${token} `, token]) {
      expect((await t.query(api.invites.preview, { token: input })).status).toBe('ok');
    }
  });

  test('redeem accepts the scanned full link', async () => {
    const { t, familyId, kidId } = await withUnjoinedKid();
    const { qrPayload } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.invites.create, { memberId: kidId });
    const family = await t.run((ctx) => ctx.db.get(familyId));
    const { memberId } = await t.withIdentity({ subject: 'kid-device-scan' }).action(api.invites.redeem, { token: qrPayload, parentCode: family!.parentCode });
    expect(memberId).toBe(kidId);
  });
});

describe('Activity: who decided names the person', () => {
  test('a person’s event says member:<their id>; an actor outside the family, or none, stays a bare "member"', async () => {
    const t = convexTest(schema, modules);
    const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const done = { memory: true, profiler: true, triggers: true };
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...family } = (await ctx.db.get(familyId))!;
      const otherFamilyId = await ctx.db.insert('families', family);
      const outsider = await ctx.db.insert('members', { familyId: otherFamilyId, name: 'Outsider', role: 'adult', activities: [], hasMega: false });
      await ctx.db.insert('familyEvents', { familyId, at: Date.UTC(2030, 0, 3), type: 'calendar.changed', payload: { actorId: members.partner }, processed: done });
      await ctx.db.insert('familyEvents', { familyId, at: Date.UTC(2030, 0, 2), type: 'list.changed', payload: { actorId: outsider }, processed: done });
      await ctx.db.insert('familyEvents', { familyId, at: Date.UTC(2030, 0, 1), type: 'notification.answered', payload: {}, processed: done });
    });
    const page = await t.withIdentity({ subject: 'sample:admin' }).query(api.megas.activity, { paginationOpts: { numItems: 3, cursor: null } });
    expect(page.page.map((i) => i.decidedBy)).toEqual([`member:${members.partner}`, 'member', 'member']);
  });
});
