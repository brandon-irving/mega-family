/// <reference types="vite/client" />
// G5 review fixes (CONTRACT v0.17b), each written to fail before its fix: schedule-link reasons (U1), the
// onboarding resume (C2), repeat answers to rule-answered blocks (C3), the sync lease (C4), the Calendar sync
// token (C5), adults-only skip (C8), combined reconnect (C9/C10), the full-family escape (C12), the profiler
// claim (C13), invite retrieval (U3), and the frontend's asks (activity decidedBy, kid's own rules, kid
// notification cap). Synthetic data only.
import { register as registerPersistentTextStreaming } from '@convex-dev/persistent-text-streaming/test';
import { ConvexError } from 'convex/values';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GOOGLE } from '../shared/config/google';
import { jsonReply, makeFakeChatModel } from './adapters/fakeChatModel';
import { makeFakeCalendarSource, makeFakeGoogleOAuth, makeFakeMailSource } from './adapters/fakeGoogle';
import { makeFakeIcsFetcher } from './adapters/fakeIcsFetcher';
import { __setCalendarSourceForTests, __setChatModelForTests, __setGoogleOAuthForTests, __setIcsFetcherForTests, __setMailSourceForTests } from './adapters/registry';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { IcsFetcher } from './ports/icsFetcher';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';
type Key = 'admin' | 'partner' | 'twin1' | 'twin2';
const codeOf = (e: unknown) => (e instanceof ConvexError ? (e.data as { code?: string }).code : (e as { data?: { code?: string } })?.data?.code);
const KEY = btoa('k'.repeat(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let modelCalls = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  process.env.INTEGRATION_TOKEN_KEY = KEY;
  process.env.CONVEX_SITE_URL = 'https://test-site.convex.site';
  process.env.SITE_URL = 'http://localhost:8081';
  modelCalls = 0;
  __setGoogleOAuthForTests(makeFakeGoogleOAuth());
  __setMailSourceForTests(makeFakeMailSource());
  __setCalendarSourceForTests(makeFakeCalendarSource());
  __setIcsFetcherForTests(makeFakeIcsFetcher());
  __setChatModelForTests(
    makeFakeChatModel(() => {
      modelCalls++;
      return jsonReply({ items: [] });
    }),
  );
});
afterEach(() => {
  for (const k of ['INTEGRATION_TOKEN_KEY', 'CONVEX_SITE_URL', 'SITE_URL']) delete process.env[k];
  __setGoogleOAuthForTests(null);
  __setMailSourceForTests(null);
  __setCalendarSourceForTests(null);
  __setIcsFetcherForTests(null);
  __setChatModelForTests(null);
  vi.useRealTimers();
});

async function seeded() {
  const t = convexTest(schema, modules);
  registerPersistentTextStreaming(t);
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const m = members as unknown as Record<Key, Id<'members'>>;
  const as = (k: Key) => t.withIdentity({ subject: `sample:${k}` });
  const settle = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const connectGoogle = async (k: Key, want: ('gmail' | 'googleCalendar')[], opts: { error?: string } = {}) => {
    const { authUrl } = await as(k).mutation(api.integrations.googleStart, { want });
    const state = new URL(authUrl).searchParams.get('state')!;
    const q = new URLSearchParams({ state, ...(opts.error ? { error: opts.error } : { code: 'good-code' }) });
    return t.fetch(`${GOOGLE.callbackPath}?${q}`, { method: 'GET', redirect: 'manual' });
  };
  const integ = (k: Key, kind: string) => t.run(async (ctx) => (await ctx.db.query('integrations').withIndex('by_family_member_kind', (q) => q.eq('familyId', familyId).eq('memberId', m[k]).eq('kind', kind as 'gmail')).collect())[0] ?? null);
  const thread = (k: Key) =>
    t.run(async (ctx) => {
      const th = await ctx.db.query('threads').withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', m[k])).unique();
      return th ? ctx.db.query('messages').withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', th._id)).collect() : [];
    });
  return { t, familyId, m, as, settle, connectGoogle, integ, thread };
}

const failingIcs = (detail: string, failure: 'error' | 'no_result' = 'error'): IcsFetcher => ({ fetch: async () => ({ ok: false, failure, detail }) });

describe('U1: a schedule link that can’t be added says why', () => {
  test('unreachable (timed out / network) → reason "unreachable"; nothing saved', async () => {
    const s = await seeded();
    __setIcsFetcherForTests(failingIcs('unreachable'));
    expect(await s.as('partner').action(api.integrations.addIcs, { url: 'https://slow.example.org/a.ics' })).toEqual({ events: 0, failure: 'error', reason: 'unreachable' });
    expect(await s.integ('partner', 'ics')).toBeNull();
  });

  test('a page that isn’t a calendar → "not_a_calendar"; too big → "too_large"; a private host → "refused"', async () => {
    const s = await seeded();
    __setIcsFetcherForTests(makeFakeIcsFetcher('<html>hello</html>'));
    expect(await s.as('partner').action(api.integrations.addIcs, { url: 'https://site.example.org/a.ics' })).toMatchObject({ events: 0, reason: 'not_a_calendar' });
    __setIcsFetcherForTests(failingIcs('too_large'));
    expect(await s.as('partner').action(api.integrations.addIcs, { url: 'https://site.example.org/b.ics' })).toMatchObject({ events: 0, reason: 'too_large' });
    __setIcsFetcherForTests(failingIcs('refused'));
    expect(await s.as('partner').action(api.integrations.addIcs, { url: 'https://site.example.org/c.ics' })).toMatchObject({ events: 0, reason: 'refused' });
  });

  test('a link to a private address is a VALIDATION error before anything is fetched', async () => {
    const s = await seeded();
    const fetcher = makeFakeIcsFetcher();
    __setIcsFetcherForTests(fetcher);
    expect(codeOf(await s.as('partner').action(api.integrations.addIcs, { url: 'https://169.254.169.254/latest/meta-data/' }).catch((e) => e))).toBe('VALIDATION');
    expect(fetcher.urls).toHaveLength(0);
  });
});

describe('C4: one sync per integration at a time', () => {
  test('while a sync holds the lease, another sync of the same integration does nothing (no provider calls, no writes)', async () => {
    const s = await seeded();
    const mail = makeFakeMailSource();
    __setMailSourceForTests(mail);
    await s.connectGoogle('partner', ['gmail']);
    await s.settle();
    const gmail = (await s.integ('partner', 'gmail'))!;
    const before = mail.requests.length;
    const configBefore = JSON.stringify(gmail.config);
    await s.t.run((ctx) => ctx.db.patch(gmail._id, { syncingUntil: Date.now() + 60_000 }));
    await s.t.action(internal.integrations.syncGmail, { integrationId: gmail._id });
    expect(mail.requests.length).toBe(before);
    expect(JSON.stringify((await s.integ('partner', 'gmail'))!.config)).toBe(configBefore);
  });

  test('a finished sync releases its lease; an expired lease does not block', async () => {
    const s = await seeded();
    const mail = makeFakeMailSource();
    __setMailSourceForTests(mail);
    await s.connectGoogle('partner', ['gmail']);
    await s.settle();
    const gmail = (await s.integ('partner', 'gmail'))!;
    expect(gmail.syncingUntil).toBeUndefined();
    await s.t.run((ctx) => ctx.db.patch(gmail._id, { syncingUntil: Date.now() - 1 }));
    const before = mail.requests.length;
    await s.t.action(internal.integrations.syncGmail, { integrationId: gmail._id });
    expect(mail.requests.length).toBeGreaterThan(before);
    expect((await s.integ('partner', 'gmail'))!.syncingUntil).toBeUndefined();
  });

  test('a sync position write merges into the stored config instead of replacing it', async () => {
    const s = await seeded();
    const { integrationId } = await s.as('partner').action(api.integrations.addIcs, { url: 'https://cal.example.org/team.ics' });
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.get(integrationId!))!;
      await ctx.db.patch(integrationId!, { config: { ...row.config, keepMe: 'yes' } });
    });
    await s.t.action(internal.integrations.syncIcs, { integrationId: integrationId! });
    expect((await s.t.run((ctx) => ctx.db.get(integrationId!)))!.config).toMatchObject({ keepMe: 'yes', url: 'https://cal.example.org/team.ics' });
  });
});

describe('C5: Google Calendar never loses its sync token', () => {
  const ev = (i: number) => ({ externalId: `e${i}`, title: `Event ${i}`, start: Date.UTC(2026, 9, 27, 14) + i * 60_000, cancelled: false });
  const pages = (perPage: number, count: number) => Array.from({ length: count }, (_, p) => Array.from({ length: perPage }, (_, i) => ev(p * perPage + i)));

  test('the event cap is reached before the last page: it keeps paging to the page with nextSyncToken and stores it', async () => {
    const s = await seeded();
    const book = pages(300, 3);
    const requests: (string | undefined)[] = [];
    __setCalendarSourceForTests({
      async listEvents({ pageToken }) {
        requests.push(pageToken);
        const i = pageToken ? Number(pageToken) : 0;
        return { ok: true, expired: false, events: book[i], ...(i < 2 ? { nextPageToken: String(i + 1) } : { nextSyncToken: 'sync-final' }) };
      },
    });
    await s.connectGoogle('partner', ['googleCalendar']);
    await s.settle();
    const row = (await s.integ('partner', 'googleCalendar'))!;
    expect(requests).toEqual([undefined, '1', '2']);
    expect(row.config).toMatchObject({ syncToken: 'sync-final' });
    const all = await s.t.run((ctx) => ctx.db.query('events').collect());
    expect(all.filter((e) => e.integrationId === row._id).length).toBeLessThanOrEqual(500);
  });

  test('an incremental pass that comes back without a new token keeps the old one', async () => {
    const s = await seeded();
    let calls = 0;
    __setCalendarSourceForTests({
      async listEvents({ syncToken }) {
        calls++;
        if (!syncToken) return { ok: true, expired: false, events: [ev(1)], nextSyncToken: 'T0' };
        return { ok: true, expired: false, events: [ev(2)] };
      },
    });
    await s.connectGoogle('partner', ['googleCalendar']);
    await s.settle();
    const row = (await s.integ('partner', 'googleCalendar'))!;
    expect(row.config).toMatchObject({ syncToken: 'T0' });
    await s.t.action(internal.integrations.syncGoogleCalendar, { integrationId: row._id });
    expect(calls).toBe(2);
    expect((await s.integ('partner', 'googleCalendar'))!.config).toMatchObject({ syncToken: 'T0' });
  });
});
