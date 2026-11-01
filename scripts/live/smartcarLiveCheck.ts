// Vehicles live check: proves the Smartcar adapter against the real API, then runs MEGA's own backend flow
// (link → agent tool → approve a command → webhook) on a convex-test backend with the REAL adapter installed.
// No deployment needed; everything else (push, chat model) stays on the fakes.
//
// Run from this repo through the secrets runner, so the Smartcar credentials are injected and never printed:
//   SECRETS_FILE=/Users/brandonirving/products/mega/.env.secrets node scripts/secrets.mjs run --only tool -- npx tsx scripts/live/smartcarLiveCheck.ts
//
// Real calls: 1 token, 1–2 connection pages, 2–3 signal reads, and 1 lock command — only on a SIMULATED car
// (pass --live-commands to allow a real car; nothing else ever sends a command to one).
import { convexTest } from 'convex-test';
import { VEHICLES } from '../../shared/config/vehicles';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { __setVehiclesForTests } from '../../convex/adapters/registry';
import { hmacHex, smartcarVehicles } from '../../convex/adapters/smartcar';
import schema from '../../convex/schema';
import { buildModules } from './convexModules';

const WEEK = '2026-10-25';
const allowLiveCommands = process.argv.includes('--live-commands');
let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  for (const name of [VEHICLES.env.clientId, VEHICLES.env.clientSecret, VEHICLES.env.managementToken]) {
    if (!process.env[name]) {
      console.error(`${name} is not set (run this through scripts/secrets.mjs)`);
      process.exit(2);
    }
  }

  // 1. The adapter against the real API.
  const conns = await smartcarVehicles.listConnections();
  check('token + list connections', conns.ok, conns.ok ? `${conns.connections.length} connected car(s)` : `${conns.failure} ${conns.detail ?? ''}`);
  if (!conns.ok) return;
  const t = convexTest(schema, buildModules());
  __setVehiclesForTests(smartcarVehicles);
  await webhookChecks(t);
  await connectLinkCheck(convexTest(schema, buildModules())); // its own backend: the seed's sample logins are unique per backend
  if (!conns.connections.length) {
    console.log('\nNo cars are connected to this Smartcar application yet. Create one in Dashboard → Simulator, then rerun for the car checks.');
    failures++;
    return;
  }
  const car = conns.connections.find((c) => c.mode === 'simulated') ?? conns.connections[0];
  console.log(`      using ${car.mode} ${car.year ?? ''} ${car.make} ${car.model} (${car.powertrain ?? 'unknown powertrain'})`);
  const read = await smartcarVehicles.readState(car);
  check('read signals', read.ok, read.ok ? JSON.stringify({ ...read.state, location: read.state.location ? '(present)' : undefined }) : `${read.failure} ${read.detail ?? ''}`);

  // 2. MEGA's backend flow with the real adapter.
  const { familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const admin = await t.run(async (ctx) => (await ctx.db.query('members').withIndex('by_family', (q) => q.eq('familyId', familyId)).collect()).find((m) => m.role === 'admin')!);
  const asAdmin = t.withIdentity({ subject: admin.authId! });

  const available = await asAdmin.action(api.vehicles.available, {});
  check('vehicles.available lists the car', available.some((c) => c.providerVehicleId === car.providerVehicleId));
  const vehicleId = await asAdmin.action(api.vehicles.link, { providerVehicleId: car.providerVehicleId, nickname: 'The van' });
  const linked = await asAdmin.query(api.vehicles.list, {});
  check('vehicles.link stored a reading', !!linked[0]?.state, JSON.stringify(linked[0]?.state ?? null));

  const status = await t.action(internal.agent.netTools.run, { familyId, memberId: admin._id, role: 'admin', name: 'vehicle_status', argumentsJson: '{}' });
  check('agent tool vehicle_status', status.ok && status.resultText.startsWith('Car reading'), status.resultText);

  if (car.mode === 'simulated' || allowLiveCommands) {
    const { commandId } = await asAdmin.mutation(api.vehicles.requestCommand, { vehicleId: vehicleId as Id<'vehicles'>, command: 'lock' });
    const pending = await t.run((ctx) => ctx.db.get(commandId));
    await asAdmin.mutation(api.chat.answerBlock, { messageId: pending!.messageId!, answer: { optionIds: ['approve'] }, via: 'text' });
    // Run the scheduled command action for real (it may take a while: Smartcar holds slow commands open).
    await t.finishInProgressScheduledFunctions();
    for (let i = 0; i < 60; i++) {
      const c = await t.run((ctx) => ctx.db.get(commandId));
      if (c && c.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 1000));
      await t.finishInProgressScheduledFunctions();
    }
    const done = await t.run((ctx) => ctx.db.get(commandId));
    check('approved lock command ran on the car', done?.status === 'succeeded', `${done?.status}${done?.failure ? ` (${done.failure})` : ''}`);
  } else {
    console.log('SKIP  commands (live car; pass --live-commands to allow)');
  }

  await signedDeliveryCheck(t, car);
}

/** MEGA's Connect link for a member: built with the real Application ID and accepted by Smartcar's Connect page. */
async function connectLinkCheck(t: ReturnType<typeof convexTest>) {
  if (!process.env[VEHICLES.env.applicationId]) {
    console.log('SKIP  connect link (SMART_CAR_APPLICATION_ID not set)');
    return;
  }
  const { familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const admin = await t.run(async (ctx) => (await ctx.db.query('members').withIndex('by_family', (q) => q.eq('familyId', familyId)).collect()).find((m) => m.role === 'admin')!);
  const { url } = await t.withIdentity({ subject: admin.authId! }).action(api.vehicles.connectUrl, { mode: 'simulated' });
  const res = await fetch(url, { redirect: 'manual' });
  const where = res.headers.get('location') ?? '';
  const rejected = res.status >= 400 || /error=/.test(where);
  check('connect link accepted by Smartcar', !rejected, `HTTP ${res.status}${where ? ` → ${where.split('?')[0]}${/error=/.test(where) ? ` (${new URL(where, url).searchParams.get('error')}: ${new URL(where, url).searchParams.get('error_description')})` : ''}` : ''}`);
}

const managementKey = () => process.env[VEHICLES.env.managementToken]!;

/** Needs no car: the VERIFY answer with the real Management Token, and a forged signature is rejected. */
async function webhookChecks(t: ReturnType<typeof convexTest>) {
  const challenge = await t.fetch(VEHICLES.webhookPath, { method: 'POST', body: JSON.stringify({ eventId: 'live-verify', eventType: 'VERIFY', data: { challenge: 'live-check' } }) });
  check('webhook VERIFY answer', challenge.status === 200 && (await challenge.json()).challenge === (await hmacHex(managementKey(), 'live-check')));
  const body = JSON.stringify({ eventId: 'forged', eventType: 'VEHICLE_STATE', data: { user: { id: 'u' }, vehicle: { id: 'v' }, signals: [] }, meta: {} });
  const forged = await t.fetch(VEHICLES.webhookPath, { method: 'POST', body, headers: { 'SC-Signature': 'ab'.repeat(32) } });
  check('forged webhook rejected', forged.status === 401);
}

/** After linking: a delivery signed with the real Management Token is stored and raises the low-tire alert. */
async function signedDeliveryCheck(t: ReturnType<typeof convexTest>, car: { providerVehicleId: string; providerUserId: string }) {
  const body = JSON.stringify({
    eventId: 'live-state', eventType: 'VEHICLE_STATE',
    data: { user: { id: car.providerUserId }, vehicle: { id: car.providerVehicleId }, triggers: [], signals: [{ code: 'wheel-tires', body: { unit: 'psi', values: [{ row: 0, column: 0, tirePressure: 21 }] } }] },
    meta: { sequence: Number.MAX_SAFE_INTEGER, deliveredAt: new Date().toISOString() },
  });
  const signed = await t.fetch(VEHICLES.webhookPath, { method: 'POST', body, headers: { 'SC-Signature': await hmacHex(managementKey(), body) } });
  const alerts = await t.run(async (ctx) => (await ctx.db.query('candidates').collect()).filter((c) => c.source?.kind === 'vehicleAlert').length);
  check('signed webhook delivery stored and raised the low-tire alert', signed.status === 200 && alerts > 0, `${alerts} vehicle alert(s)`);
}

main()
  .then(() => {
    console.log(failures ? `\n${failures} check(s) failed` : '\nAll live checks passed');
    process.exit(failures ? 1 : 0);
  })
  .catch((e) => {
    console.error('live check crashed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
