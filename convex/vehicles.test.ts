/// <reference types="vite/client" />
// Vehicles addendum: the Smartcar adapter's parsing and HTTP shape, the signed webhook route, who can see a car,
// approve-before-run commands, proactive alerts, the agent tools and the vehicle MCP endpoint.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { VEHICLES } from '../shared/config/vehicles';
import { zonedInstant } from '../shared/time';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { FAKE_CONNECTION, FAKE_VEHICLE_WEBHOOK_KEY, makeFakeVehicles, type FakeVehicles } from './adapters/fakeVehicles';
import { __setVehiclesForTests } from './adapters/registry';
import { __resetSmartcarTokenForTests, hmacHex, parseConnections, parseWebhook, smartcarVehicles, stateFromSignals, verifyHmacHex } from './adapters/smartcar';
import { activeAlerts, applyVehicleState, newAlerts, stateSentence } from './model/vehicles';
import { vehicleMcp } from './model/vehicleMcp';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

// ---------- adapter: pure parsing ----------

describe('Smartcar adapter parsing', () => {
  test('connections: vehicle id from relationships, owner from attributes.user', () => {
    const parsed = parseConnections({
      data: [
        { id: 'conn1', attributes: { vehicle: { make: 'TOYOTA', model: 'Sienna', year: 2022, mode: 'simulated', powertrainType: 'HEV' }, user: { id: 'usr1' } }, relationships: { vehicle: { data: { id: 'veh1' } } } },
        { id: 'broken', attributes: { vehicle: { make: 'X' } } },
      ],
    });
    expect(parsed).toEqual([{ providerVehicleId: 'veh1', providerUserId: 'usr1', make: 'TOYOTA', model: 'Sienna', year: 2022, mode: 'simulated', powertrain: 'HEV' }]);
  });

  test('signals: km → miles, kPa → psi, percents kept, errored and unknown signals skipped', () => {
    const s = stateFromSignals([
      { code: 'internalcombustionengine-fuellevel', body: { value: 12, unit: 'percent' }, ok: true },
      { code: 'internalcombustionengine-range', body: { value: 100, unit: 'km' }, ok: true },
      { code: 'odometer-traveleddistance', body: { value: 1000, unit: 'km' }, ok: true },
      { code: 'wheel-tires', body: { rowCount: 2, columnCount: 2, unit: 'kPa', values: [{ row: 0, column: 0, tirePressure: 172 }, { row: 1, column: 1, tirePressure: 230 }] }, ok: true },
      { code: 'closure-islocked', body: { value: false }, ok: true },
      { code: 'location-preciselocation', body: { latitude: 40.1, longitude: -73.2 }, ok: true, retrievedAt: 5_000 },
      { code: 'internalcombustionengine-oillife', body: { value: 9 }, ok: false },
      { code: 'mystery-signal', body: { value: 1 }, ok: true },
    ], 1);
    expect(s).toEqual({ fuelPct: 12, rangeMiles: 62, odometerMiles: 621, tiresPsi: { frontLeft: 24.9, rearRight: 33.4 }, isLocked: false, location: { lat: 40.1, lng: -73.2 }, readAt: 5_000 });
  });

  test('webhook: VERIFY and VEHICLE_STATE payloads (v4)', () => {
    expect(parseWebhook({ eventId: 'e0', eventType: 'VERIFY', data: { challenge: 'abc' } })).toEqual({ kind: 'verify', challenge: 'abc' });
    const e = parseWebhook({
      eventId: 'e1', eventType: 'VEHICLE_STATE',
      data: { user: { id: 'usr1' }, vehicle: { id: 'veh1' }, triggers: [], signals: [{ code: 'tractionbattery-stateofcharge', body: { value: 18, unit: 'percent' }, meta: { retrievedAt: 9_000 } }, { code: 'location-isathome', status: { value: 'ERROR' } }] },
      meta: { sequence: 7, deliveredAt: '2026-10-31T00:00:00Z' },
    });
    expect(e).toEqual({ kind: 'state', eventId: 'e1', sequence: 7, providerVehicleId: 'veh1', providerUserId: 'usr1', state: { batteryPct: 18, readAt: 9_000 } });
    expect(parseWebhook({ version: '2.0', eventName: 'verify' }).kind).toBe('ignored');
  });

  test('HMAC: matches, rejects tampering and junk signatures', async () => {
    const sig = await hmacHex('key', '{"a":1}');
    expect(await verifyHmacHex('key', '{"a":1}', sig)).toBe(true);
    expect(await verifyHmacHex('key', '{"a":2}', sig)).toBe(false);
    expect(await verifyHmacHex('other', '{"a":1}', sig)).toBe(false);
    expect(await verifyHmacHex('key', '{"a":1}', 'zz')).toBe(false);
    expect(await verifyHmacHex('key', '{"a":1}', null)).toBe(false);
  });
});

// ---------- adapter: HTTP shape (fetch stubbed) ----------

describe('Smartcar adapter HTTP', () => {
  const env = { ...process.env };
  beforeEach(() => {
    __resetSmartcarTokenForTests();
    process.env.SMART_CAR_API_CLIENT_ID = 'cid';
    process.env.SMART_CAR_API_SECRET = 'csecret';
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  function stubFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const r = handler(url, init);
      return new Response(JSON.stringify(r.body), { status: r.status });
    });
    return calls;
  }

  test('not configured without credentials (no network)', async () => {
    delete process.env.SMART_CAR_API_SECRET;
    const calls = stubFetch(() => ({ status: 200, body: {} }));
    expect(await smartcarVehicles.listConnections()).toEqual({ ok: false, failure: 'not_configured', detail: 'not_configured' });
    expect(calls).toHaveLength(0);
  });

  test('one app token for many calls; per-car calls carry sc-user-id; destination body shape', async () => {
    const calls = stubFetch((url) => {
      if (url === VEHICLES.api.tokenUrl) return { status: 200, body: { access_token: 'tok', expires_in: 3600, token_type: 'Bearer' } };
      if (url.endsWith('/signals')) return { status: 200, body: { data: [{ id: 's', type: 'signal', attributes: { code: 'closure-islocked', name: 'IsLocked', group: 'Closure', status: { value: 'SUCCESS' }, body: { value: true } } }] } };
      return { status: 200, body: { data: { attributes: { commandType: 'navigation-set-destination', status: { value: 'SUCCESS' } } } } };
    });
    const ref = { providerVehicleId: 'veh1', providerUserId: 'usr1' };
    const read = await smartcarVehicles.readState(ref);
    expect(read.ok && read.state.isLocked).toBe(true);
    expect(await smartcarVehicles.command(ref, { command: 'set_destination', destination: { lat: 1.5, lng: -2.5 } })).toEqual({ ok: true, status: 'succeeded' });
    expect(calls.filter((c) => c.url === VEHICLES.api.tokenUrl)).toHaveLength(1);
    const tokenBody = String(calls[0].init.body);
    expect(tokenBody).toContain('grant_type=client_credentials');
    const signals = calls.find((c) => c.url.endsWith('/vehicles/veh1/signals'))!;
    expect((signals.init.headers as Record<string, string>)['sc-user-id']).toBe('usr1');
    expect((signals.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const nav = calls.find((c) => c.url.endsWith('/vehicles/veh1/commands/navigation/set-destination'))!;
    expect(JSON.parse(String(nav.init.body))).toEqual({ data: { attributes: { latitude: 1.5, longitude: -2.5 } } });
  });

  test('provider errors fail closed with the error code, never a thrown error', async () => {
    stubFetch((url) => url === VEHICLES.api.tokenUrl ? { status: 200, body: { access_token: 'tok', expires_in: 3600 } } : { status: 409, body: { type: 'VEHICLE_STATE', code: 'IN_MOTION' } });
    expect(await smartcarVehicles.command({ providerVehicleId: 'v', providerUserId: 'u' }, { command: 'lock' })).toEqual({ ok: false, failure: 'error', detail: 'VEHICLE_STATE:IN_MOTION' });
  });
});

// ---------- the backend with the fake adapter ----------

type Setup = Awaited<ReturnType<typeof setup>>;

async function setup(opts: { fake?: FakeVehicles } = {}) {
  const fake = opts.fake ?? makeFakeVehicles();
  __setVehiclesForTests(fake);
  const t = convexTest(schema, modules);
  const seeded = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const members = await t.run((ctx) => ctx.db.query('members').withIndex('by_family', (q) => q.eq('familyId', seeded.familyId)).collect());
  const byKey = (role: Doc<'members'>['role'], n = 0) => members.filter((m) => m.role === role && m.authId)[n];
  const admin = byKey('admin');
  const partner = byKey('adult');
  const kid = byKey('kid');
  return {
    t, fake, familyId: seeded.familyId as Id<'families'>, admin, partner, kid,
    asAdmin: t.withIdentity({ subject: admin.authId! }),
    asPartner: t.withIdentity({ subject: partner.authId! }),
    asKid: t.withIdentity({ subject: kid.authId! }),
  };
}

async function linkFake(s: Setup, sharing: 'private' | 'household' = 'private') {
  return s.asAdmin.action(api.vehicles.link, { providerVehicleId: FAKE_CONNECTION.providerVehicleId, nickname: 'The van', sharing });
}

afterEach(() => {
  __setVehiclesForTests(null);
  vi.useRealTimers();
});

describe('linking and who can see a car', () => {
  test('an adult links an available car; it reads once; available then excludes it', async () => {
    const s = await setup();
    expect((await s.asAdmin.action(api.vehicles.available, {})).map((c) => c.providerVehicleId)).toEqual([FAKE_CONNECTION.providerVehicleId]);
    const id = await linkFake(s);
    const car = await s.t.run((ctx) => ctx.db.get(id));
    expect(car?.state?.fuelPct).toBe(42);
    expect(await s.asAdmin.action(api.vehicles.available, {})).toEqual([]);
  });

  test('private by default: the partner and kids see nothing; household sharing shows adults only, never coordinates', async () => {
    const s = await setup();
    const id = await linkFake(s);
    expect(await s.asPartner.query(api.vehicles.list, {})).toEqual([]);
    expect(await s.asKid.query(api.vehicles.list, {})).toEqual([]);
    await s.asAdmin.mutation(api.vehicles.update, { vehicleId: id, sharing: 'household' });
    const seen = await s.asPartner.query(api.vehicles.list, {});
    expect(seen).toHaveLength(1);
    expect(seen[0].isOwner).toBe(false);
    expect(JSON.stringify(seen)).not.toMatch(/"location"|37\.77|-122\.4/);
    expect(await s.asKid.query(api.vehicles.list, {})).toEqual([]);
    await expect(s.asPartner.mutation(api.vehicles.unlink, { vehicleId: id })).rejects.toThrow();
  });

  test('kids cannot link, refresh or request commands', async () => {
    const s = await setup();
    const id = await linkFake(s, 'household');
    await expect(s.asKid.action(api.vehicles.available, {})).rejects.toThrow();
    await expect(s.asKid.action(api.vehicles.refresh, { vehicleId: id })).rejects.toThrow();
    await expect(s.asKid.mutation(api.vehicles.requestCommand, { vehicleId: id, command: 'unlock' })).rejects.toThrow();
  });

  test('a car another family already linked cannot be claimed', async () => {
    const s = await setup();
    await linkFake(s);
    const other = await s.t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    await s.t.run(async (ctx) => {
      const rows = await ctx.db.query('members').withIndex('by_family', (q) => q.eq('familyId', other.familyId)).collect();
      const a = rows.find((m) => m.role === 'admin')!;
      await ctx.db.patch(a._id, { authId: 'other:admin' });
    });
    await expect(s.t.withIdentity({ subject: 'other:admin' }).action(api.vehicles.link, { providerVehicleId: FAKE_CONNECTION.providerVehicleId })).rejects.toThrow(/NOT_FOUND/);
  });

  test("review fix: one app token lists every family's cars, but only the member who connected a car can see or claim it", async () => {
    const s0 = await setup();
    const tagOf = (m: Doc<'members'>) => `mega-fake-${m.familyId}:${m._id}`;
    const partnersLive = { ...FAKE_CONNECTION, providerVehicleId: 'veh_partner_live', mode: 'live' as const, externalId: tagOf(s0.partner) };
    const strangersSim = { ...FAKE_CONNECTION, providerVehicleId: 'veh_stranger_sim', externalId: 'mega-fake-someone-else' };
    const untaggedLive = { ...FAKE_CONNECTION, providerVehicleId: 'veh_untagged_live', mode: 'live' as const };
    __setVehiclesForTests(makeFakeVehicles({ connections: [partnersLive, strangersSim, untaggedLive, FAKE_CONNECTION] }));
    // The admin sees only the untagged simulated (demo) car: not the partner's, not a stranger's, not an untagged live car.
    expect((await s0.asAdmin.action(api.vehicles.available, {})).map((c) => c.providerVehicleId)).toEqual([FAKE_CONNECTION.providerVehicleId]);
    for (const id of ['veh_partner_live', 'veh_stranger_sim', 'veh_untagged_live']) {
      await expect(s0.asAdmin.action(api.vehicles.link, { providerVehicleId: id })).rejects.toThrow(/NOT_FOUND/);
    }
    // The partner sees their own tagged car, and can link it.
    expect((await s0.asPartner.action(api.vehicles.available, {})).map((c) => c.providerVehicleId)).toContain('veh_partner_live');
    expect(await s0.asPartner.action(api.vehicles.link, { providerVehicleId: 'veh_partner_live' })).toBeTruthy();
  });

  test('connectUrl carries the member\'s own owner tag', async () => {
    const s = await setup();
    const { url } = await s.asAdmin.action(api.vehicles.connectUrl, { mode: 'simulated' });
    expect(url).toContain(encodeURIComponent(`mega-fake-${s.familyId}:${s.admin._id}`));
    await expect(s.asKid.action(api.vehicles.connectUrl, {})).rejects.toThrow();
  });
});

describe('commands run only after Approve', () => {
  async function pendingLock(s: Setup) {
    const id = await linkFake(s);
    const { commandId } = await s.asAdmin.mutation(api.vehicles.requestCommand, { vehicleId: id, command: 'unlock' });
    const command = await s.t.run((ctx) => ctx.db.get(commandId));
    return { id, commandId, messageId: command!.messageId! };
  }

  test('requesting posts an Approve / Cancel block and calls nothing', async () => {
    const s = await setup();
    const { messageId } = await pendingLock(s);
    const msg = await s.t.run((ctx) => ctx.db.get(messageId));
    expect(msg?.ruleBlock).toBe('vehicleCommand');
    expect(msg?.body.type === 'block' && msg.body.block.kind === 'choice' && msg.body.block.options.map((o) => o.id)).toEqual(['approve', 'cancel']);
    expect(s.fake.calls.filter((c) => c.startsWith('command:'))).toEqual([]);
  });

  test('Approve runs the command once, reports back and re-reads the car', async () => {
    vi.useFakeTimers();
    const s = await setup();
    const { commandId, messageId } = await pendingLock(s);
    const args = { messageId, answer: { optionIds: ['approve'] }, via: 'text' as const };
    await s.asAdmin.mutation(api.chat.answerBlock, args);
    await s.asAdmin.mutation(api.chat.answerBlock, args);
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(s.fake.calls.filter((c) => c.startsWith('command:'))).toEqual([`command:${FAKE_CONNECTION.providerVehicleId}:unlock`]);
    expect((await s.t.run((ctx) => ctx.db.get(commandId)))?.status).toBe('succeeded');
    const car = await s.t.run((ctx) => ctx.db.query('vehicles').first());
    expect(car?.state?.isLocked).toBe(false);
    const texts = await s.t.run(async (ctx) => (await ctx.db.query('messages').collect()).flatMap((m) => (m.body.type === 'text' ? [m.body.text] : [])));
    expect(texts).toContain('Done: Unlock the doors.');
  });

  test('Cancel never calls the car; an expired request never runs', async () => {
    const s = await setup();
    const first = await pendingLock(s);
    await s.asAdmin.mutation(api.chat.answerBlock, { messageId: first.messageId, answer: { optionIds: ['cancel'] }, via: 'text' });
    expect((await s.t.run((ctx) => ctx.db.get(first.commandId)))?.status).toBe('declined');
    const { commandId } = await s.asAdmin.mutation(api.vehicles.requestCommand, { vehicleId: first.id, command: 'lock' });
    const c = await s.t.run((ctx) => ctx.db.get(commandId));
    await s.t.run((ctx) => ctx.db.patch(commandId, { expiresAt: 0 }));
    await s.asAdmin.mutation(api.chat.answerBlock, { messageId: c!.messageId!, answer: { optionIds: ['approve'] }, via: 'text' });
    expect((await s.t.run((ctx) => ctx.db.get(commandId)))?.status).toBe('expired');
    expect(s.fake.calls.filter((x) => x.startsWith('command:'))).toEqual([]);
  });

  test('a failed command says why in plain words', async () => {
    vi.useFakeTimers();
    const s = await setup({ fake: makeFakeVehicles({ commandFailure: 'VEHICLE_STATE:IN_MOTION' }) });
    const { messageId } = await pendingLock(s);
    await s.asAdmin.mutation(api.chat.answerBlock, { messageId, answer: { optionIds: ['approve'] }, via: 'text' });
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    const texts = await s.t.run(async (ctx) => (await ctx.db.query('messages').collect()).flatMap((m) => (m.body.type === 'text' ? [m.body.text] : [])));
    expect(texts).toContain("I couldn't unlock the doors: the car is moving.");
  });
});

describe('alerts', () => {
  const base = { readAt: 1 };
  test('only a condition that starts alerts; one that persists does not', () => {
    expect(newAlerts(undefined, { ...base, fuelPct: 10 }, false)).toEqual(['lowFuel']);
    expect(newAlerts({ ...base, fuelPct: 10 }, { ...base, fuelPct: 9 }, false)).toEqual([]);
    expect(newAlerts({ ...base, fuelPct: 60 }, { ...base, fuelPct: 14 }, false)).toEqual(['lowFuel']);
    expect([...activeAlerts({ ...base, batteryPct: 10, isCharging: true }, false)]).toEqual([]);
    expect([...activeAlerts({ ...base, isLocked: false }, false)]).toEqual([]);
    expect([...activeAlerts({ ...base, isLocked: false }, true)]).toEqual(['unlockedAtNight']);
  });

  test('a low tire pushes to the owner only; unlocked at night also posts a ready Lock request', async () => {
    const s = await setup();
    const id = await linkFake(s, 'household');
    const family = await s.t.run((ctx) => ctx.db.get(s.familyId));
    const night = zonedInstant('2026-10-29', 22 * 60, family!.timezone);
    await s.t.run(async (ctx) => {
      const car = (await ctx.db.get(id))!;
      await applyVehicleState(ctx, car, { ...car.state!, tiresPsi: { frontLeft: 22 }, isLocked: false, readAt: 2 }, night);
    });
    const candidates = await s.t.run((ctx) => ctx.db.query('candidates').collect());
    const mine = candidates.filter((c) => c.source?.kind === 'vehicleAlert');
    expect(mine.map((c) => c.source?.kind === 'vehicleAlert' && c.source.alert).sort()).toEqual(['lowTire', 'unlockedAtNight']);
    expect(new Set(mine.map((c) => c.recipientId))).toEqual(new Set([s.admin._id]));
    const pending = await s.t.run((ctx) => ctx.db.query('vehicleCommands').collect());
    expect(pending.map((c) => [c.command, c.status, c.requestedBy])).toEqual([['lock', 'pending', s.admin._id]]);
  });
});

describe('webhook route', () => {
  async function post(s: Setup, body: unknown, sign = true) {
    const raw = JSON.stringify(body);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sign) headers['SC-Signature'] = await hmacHex(FAKE_VEHICLE_WEBHOOK_KEY, raw);
    return s.t.fetch(VEHICLES.webhookPath, { method: 'POST', headers, body: raw });
  }
  const state = (eventId: string, sequence: number, psi: number, user = FAKE_CONNECTION.providerUserId) => ({
    eventId, eventType: 'VEHICLE_STATE',
    data: { user: { id: user }, vehicle: { id: FAKE_CONNECTION.providerVehicleId }, triggers: [{ code: 'wheel-tires' }], signals: [{ code: 'wheel-tires', body: { unit: 'psi', values: [{ row: 0, column: 0, tirePressure: psi }] }, meta: { retrievedAt: 10_000 + sequence } }] },
    meta: { sequence, deliveredAt: '2026-10-31T00:00:00Z' },
  });

  test('VERIFY is answered with the HMAC of the challenge', async () => {
    const s = await setup();
    const res = await post(s, { eventId: 'v', eventType: 'VERIFY', data: { challenge: 'xyz' } }, false);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: await hmacHex(FAKE_VEHICLE_WEBHOOK_KEY, 'xyz') });
  });

  test('unsigned or tampered deliveries are rejected and change nothing', async () => {
    const s = await setup();
    await linkFake(s);
    expect((await post(s, state('e1', 1, 20), false)).status).toBe(401);
    const raw = JSON.stringify(state('e1', 1, 20));
    const res = await s.t.fetch(VEHICLES.webhookPath, { method: 'POST', body: raw, headers: { 'SC-Signature': await hmacHex('wrong-key', raw) } });
    expect(res.status).toBe(401);
    expect((await s.t.run((ctx) => ctx.db.query('vehicles').first()))?.state?.tiresPsi?.frontLeft).toBe(33);
  });

  test('a signed delivery merges into the car and raises the alert; older or repeated ones are ignored', async () => {
    const s = await setup();
    await linkFake(s);
    expect((await post(s, state('e2', 5, 21))).status).toBe(200);
    let car = await s.t.run((ctx) => ctx.db.query('vehicles').first());
    expect(car?.state?.tiresPsi).toEqual({ frontLeft: 21 });
    expect(car?.state?.fuelPct).toBe(42); // kept from the earlier full read
    expect((await s.t.run((ctx) => ctx.db.query('candidates').collect())).filter((c) => c.source?.kind === 'vehicleAlert')).toHaveLength(1);
    await post(s, state('e1', 4, 35)); // older sequence
    await post(s, state('e2', 5, 35)); // same event again
    car = await s.t.run((ctx) => ctx.db.query('vehicles').first());
    expect(car?.state?.tiresPsi).toEqual({ frontLeft: 21 });
  });

  test('a delivery for an unlinked car, or through a different grant, is acknowledged and dropped', async () => {
    const s = await setup();
    await linkFake(s);
    expect((await post(s, state('e3', 9, 10, 'someone-else'))).status).toBe(200);
    expect((await s.t.run((ctx) => ctx.db.query('vehicles').first()))?.state?.tiresPsi?.frontLeft).toBe(33);
  });
});

describe('agent tools and MCP', () => {
  test('vehicle_status returns only reported numbers and a place name; kids are refused', async () => {
    const s = await setup();
    await linkFake(s, 'household');
    const run = (memberId: Id<'members'>, role: string, name: string, args: unknown) => s.t.action(internal.agent.netTools.run, { familyId: s.familyId, memberId, role, name, argumentsJson: JSON.stringify(args) });
    const r = await run(s.partner._id, 'adult', 'vehicle_status', {});
    expect(r.ok).toBe(true);
    expect(r.resultText).toContain('fuel 42%');
    expect(r.resultText).toContain('locked');
    expect(r.resultText).not.toMatch(/37\.77|-122\.4/);
    expect((await run(s.kid._id, 'kid', 'vehicle_status', {})).ok).toBe(false);
  });

  test('vehicle_command only posts an approval block', async () => {
    const s = await setup();
    await linkFake(s);
    const r = await s.t.action(internal.agent.netTools.run, { familyId: s.familyId, memberId: s.admin._id, role: 'admin', name: 'vehicle_command', argumentsJson: JSON.stringify({ command: 'lock' }) });
    expect(r.ok).toBe(true);
    expect(r.resultText).toContain('Nothing happens until they tap Approve');
    expect(s.fake.calls.filter((c) => c.startsWith('command:'))).toEqual([]);
    expect((await s.t.run((ctx) => ctx.db.query('vehicleCommands').collect())).map((c) => c.status)).toEqual(['pending']);
  });

  test('stateSentence names the low tire', () => {
    expect(stateSentence('The van', { tiresPsi: { frontLeft: 22, frontRight: 33 }, readAt: 1 }, 'at Home')).toBe('The van (at Home): front-left tire LOW at 22 psi.');
  });

  test('MCP: lists the three tools; calls run as the signed-in adult; signed-out is 401', async () => {
    const list = await vehicleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, async () => ({ ok: true, text: '' }));
    expect((list as { result: { tools: { name: string }[] } }).result.tools.map((x) => x.name)).toEqual(['vehicle_list', 'vehicle_status', 'vehicle_command']);
    const s = await setup();
    await linkFake(s);
    const call = (who: typeof s.asAdmin | typeof s.t, name: string, args: unknown = {}) => who.fetch(VEHICLES.mcpPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }) });
    expect((await call(s.t, 'vehicle_list')).status).toBe(401);
    const listed = await (await call(s.asAdmin, 'vehicle_list')).json();
    expect(listed.result.content[0].text).toContain('The van');
    const kid = await (await call(s.asKid, 'vehicle_status')).json();
    expect(kid.result.isError).toBe(true);
    const cmd = await (await call(s.asAdmin, 'vehicle_command', { command: 'lock' })).json();
    expect(cmd.result.content[0].text).toContain('Approve');
    expect(s.fake.calls.filter((c) => c.startsWith('command:'))).toEqual([]);
  });
});
