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
