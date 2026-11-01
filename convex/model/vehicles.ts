// Connected cars (Vehicles addendum, pending approval): who may see and act on a car, how a reading is described,
// which readings raise a proactive alert, and the approve-before-run command flow. No network here: the Vehicles
// port is called from actions (convex/vehicles.ts, convex/agent/netTools.ts).
//
// Privacy rule: a car's location is its driver's location. A car is private to the adult who linked it unless they
// share it with the household, and then only adults see it. Kids (teens included) never do. Readers see the
// nearest saved family place ("at Home"), never coordinates.
import { VEHICLE_COPY, VEHICLE_ROLES, VEHICLES, vehicleAlertDedupeKey } from '../../shared/config/vehicles';
import type { BlockAnswer } from '../../shared/domain/messages';
import type { TirePressures, VehicleAlertKind, VehicleCommandKind, VehicleState } from '../../shared/domain/vehicles';
import { localDate, localParts } from '../../shared/time';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';
import { familyPlaces, isGeocoded } from './places';
import { deliverNowIfAlreadyDue, finalizeCandidateLogic, insertCandidateIfNew } from './proactive';
import { postOwnMegaMessage } from './threads';

type Ctx = QueryCtx | MutationCtx;
const MIN = 60_000;

// ---------- access ----------

export function isVehicleRole(role: Doc<'members'>['role']): boolean {
  return (VEHICLE_ROLES as readonly string[]).includes(role);
}

export function canReadVehicle(member: Doc<'members'>, vehicle: Doc<'vehicles'>): boolean {
  if (member.familyId !== vehicle.familyId || !isVehicleRole(member.role)) return false;
  return vehicle.ownerId === member._id || vehicle.sharing === 'household';
}

export async function readableVehicles(ctx: Ctx, member: Doc<'members'>): Promise<Doc<'vehicles'>[]> {
  if (!isVehicleRole(member.role)) return [];
  const rows = await ctx.db.query('vehicles').withIndex('by_family', (q) => q.eq('familyId', member.familyId)).collect();
  return rows.filter((v) => canReadVehicle(member, v));
}

export async function requireReadableVehicle(ctx: Ctx, member: Doc<'members'>, vehicleId: Id<'vehicles'>): Promise<Doc<'vehicles'>> {
  const vehicle = await ctx.db.get(vehicleId);
  if (!vehicle || !canReadVehicle(member, vehicle)) fail('NOT_FOUND');
  return vehicle;
}

/** The car a member means: by nickname/make/model when named; otherwise their only car, or the one they own. */
export async function vehicleByName(ctx: Ctx, member: Doc<'members'>, name?: string): Promise<Doc<'vehicles'> | null> {
  const cars = await readableVehicles(ctx, member);
  const want = name?.trim().toLowerCase();
  if (want) {
    const label = (c: Doc<'vehicles'>) => [c.nickname, c.make, c.model, `${c.make} ${c.model}`].map((x) => x.toLowerCase());
    return cars.find((c) => label(c).includes(want)) ?? cars.find((c) => label(c).some((l) => l.includes(want) || want.includes(l))) ?? null;
  }
  if (cars.length === 1) return cars[0];
  return cars.find((c) => c.ownerId === member._id) ?? cars[0] ?? null;
}

export function defaultNickname(make: string, model: string): string {
  const name = make && make.toLowerCase() !== 'simulated' ? `${make} ${model}`.trim() : 'The car';
  return name.slice(0, VEHICLES.limits.nicknameMaxLength);
}

// ---------- describing a reading ----------

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "at Home", "2.4 mi from School", or '' when nothing is known. Never coordinates. */
export async function whereLabel(ctx: Ctx, familyId: Id<'families'>, location?: { lat: number; lng: number }): Promise<string> {
  if (!location) return '';
  const places = (await familyPlaces(ctx, familyId)).filter(isGeocoded);
  let best: { label: string; miles: number } | null = null;
  for (const p of places) {
    const miles = milesBetween(location, { lat: p.lat, lng: p.lng });
    if (!best || miles < best.miles) best = { label: p.label, miles };
  }
  if (!best) return '';
  return best.miles <= VEHICLES.atPlaceMiles ? `at ${best.label}` : `${Math.round(best.miles * 10) / 10} mi from ${best.label}`;
}

const TIRE_NAMES: Record<keyof TirePressures, string> = { frontLeft: 'front-left', frontRight: 'front-right', rearLeft: 'rear-left', rearRight: 'rear-right' };

export function lowestTire(tires?: TirePressures): { which: string; psi: number } | null {
  if (!tires) return null;
  let low: { which: string; psi: number } | null = null;
  for (const [k, psi] of Object.entries(tires) as [keyof TirePressures, number | undefined][]) {
    if (psi === undefined) continue;
    if (!low || psi < low.psi) low = { which: TIRE_NAMES[k], psi };
  }
  return low;
}

/** The agent-facing sentence: only the numbers the car reported. */
export function stateSentence(nickname: string, state: VehicleState, where: string): string {
  const parts: string[] = [];
  if (state.fuelPct !== undefined) parts.push(`fuel ${state.fuelPct}%`);
  if (state.batteryPct !== undefined) parts.push(`battery ${state.batteryPct}%${state.isCharging ? ' (charging)' : ''}`);
  if (state.rangeMiles !== undefined) parts.push(`about ${state.rangeMiles} miles of range`);
  if (state.isLocked !== undefined) parts.push(state.isLocked ? 'locked' : 'unlocked');
  const tire = lowestTire(state.tiresPsi);
  if (tire) parts.push(tire.psi < VEHICLES.alerts.lowTirePsi ? `${tire.which} tire LOW at ${tire.psi} psi` : `tires fine (lowest ${tire.psi} psi)`);
  if (state.oilLifePct !== undefined) parts.push(`oil life ${state.oilLifePct}%`);
  if (state.odometerMiles !== undefined) parts.push(`${state.odometerMiles} miles on the odometer`);
  return `${nickname}${where ? ` (${where})` : ''}: ${parts.join(', ') || 'no readings available'}.`;
}

// ---------- alerts ----------

function isNight(now: number, tz: string): boolean {
  const { hour } = localParts(now, tz);
  const { fromHour, toHour } = VEHICLES.alerts.night;
  return hour >= fromHour || hour < toHour;
}

/** Which alerts hold for a reading. */
export function activeAlerts(state: VehicleState | undefined, night: boolean): Set<VehicleAlertKind> {
  const out = new Set<VehicleAlertKind>();
  if (!state) return out;
  const a = VEHICLES.alerts;
  if (state.fuelPct !== undefined && state.fuelPct <= a.lowFuelPct) out.add('lowFuel');
  if (state.batteryPct !== undefined && state.batteryPct <= a.lowBatteryPct && !state.isCharging) out.add('lowBattery');
  const tire = lowestTire(state.tiresPsi);
  if (tire && tire.psi < a.lowTirePsi) out.add('lowTire');
  if (state.oilLifePct !== undefined && state.oilLifePct <= a.lowOilPct) out.add('lowOil');
  if (state.isLocked === false && night) out.add('unlockedAtNight');
  return out;
}

/** Alerts that start with this reading (held now, not held by the previous one). A recovered-then-repeated
 * condition alerts again; one that simply persists does not. */
export function newAlerts(prev: VehicleState | undefined, next: VehicleState, night: boolean): VehicleAlertKind[] {
  const before = activeAlerts(prev, night);
  return [...activeAlerts(next, night)].filter((a) => !before.has(a));
}

function alertText(alert: VehicleAlertKind, car: string, s: VehicleState, where: string): { title: string; text: string } {
  const c = VEHICLE_COPY.alerts;
  switch (alert) {
    case 'lowFuel': return { title: c.lowFuel.title, text: c.lowFuel.text(car, s.fuelPct ?? 0, s.rangeMiles) };
    case 'lowBattery': return { title: c.lowBattery.title, text: c.lowBattery.text(car, s.batteryPct ?? 0, s.rangeMiles) };
    case 'lowTire': {
      const t = lowestTire(s.tiresPsi)!;
      return { title: c.lowTire.title, text: c.lowTire.text(car, t.which, t.psi) };
    }
    case 'lowOil': return { title: c.lowOil.title, text: c.lowOil.text(car, s.oilLifePct ?? 0) };
    case 'unlockedAtNight': return { title: c.unlockedAtNight.title, text: c.unlockedAtNight.text(car, where) };
  }
}

/** Stores a reading and raises any alert it starts. Alerts go to the car's owner only (the person who linked it);
 * each is a push through the normal pipeline (quiet hours and caps still apply). An unlocked-at-night alert also
 * posts a ready-to-approve "Lock" request in the owner's chat. */
export async function applyVehicleState(ctx: MutationCtx, vehicle: Doc<'vehicles'>, state: VehicleState, now: number): Promise<VehicleAlertKind[]> {
  const family = await ctx.db.get(vehicle.familyId);
  if (!family) return [];
  const prev = vehicle.state;
  await ctx.db.patch(vehicle._id, { state });
  const fired = newAlerts(prev, state, isNight(now, family.timezone));
  if (!fired.length) return [];
  const owner = await ctx.db.get(vehicle.ownerId);
  if (!owner || !isVehicleRole(owner.role)) return [];
  const where = await whereLabel(ctx, vehicle.familyId, state.location);
  const day = localDate(now, family.timezone);
  for (const alert of fired) {
    const { title, text } = alertText(alert, vehicle.nickname, state, where);
    const candidateId = await insertCandidateIfNew(ctx, {
      familyId: vehicle.familyId,
      recipientId: owner._id,
      kind: 'update',
      dedupeKey: `${vehicleAlertDedupeKey(vehicle._id, alert, owner._id, day)}:${state.readAt}`,
      draftText: text,
      window: { from: now, to: now + 6 * 60 * MIN },
      source: { kind: 'vehicleAlert', vehicleId: vehicle._id, alert },
    });
    if (!candidateId) continue;
    await finalizeCandidateLogic(ctx, { candidateId, kind: 'update', title, text, score: 1, reason: `vehicle ${alert}`, forcedDelivery: 'push' });
    await deliverNowIfAlreadyDue(ctx, candidateId, now);
    if (alert === 'unlockedAtNight') await createCommandRequest(ctx, { vehicle, requester: owner, command: 'lock', now });
  }
  return fired;
}

/** Proactive engine re-check at delivery: the car is still linked and the alert still holds. */
export async function vehicleAlertStillApplies(ctx: Ctx, vehicleId: Id<'vehicles'>, alert: VehicleAlertKind): Promise<boolean> {
  const vehicle = await ctx.db.get(vehicleId);
  if (!vehicle?.state) return false;
  if (alert === 'unlockedAtNight') return vehicle.state.isLocked === false;
  return activeAlerts(vehicle.state, false).has(alert);
}

// ---------- commands (approve before run) ----------

export function commandLabel(command: VehicleCommandKind, destinationLabel?: string): string {
  if (command === 'lock') return 'Lock the doors';
  if (command === 'unlock') return 'Unlock the doors';
  return `Send ${destinationLabel ?? 'the destination'} to the car's navigation`;
}

/** Records a pending command and posts its Approve / Cancel block in the requester's own chat. Nothing runs
 * until they tap Approve (`answerVehicleCommand`). */
export async function createCommandRequest(
  ctx: MutationCtx,
  p: { vehicle: Doc<'vehicles'>; requester: Doc<'members'>; command: VehicleCommandKind; destination?: { label: string; lat: number; lng: number }; now: number },
): Promise<{ commandId: Id<'vehicleCommands'>; messageId: Id<'messages'> | null }> {
  if (!canReadVehicle(p.requester, p.vehicle)) fail('NOT_FOUND');
  if (p.command === 'set_destination' && !p.destination) fail('VALIDATION', 'a destination is required');
  const commandId = await ctx.db.insert('vehicleCommands', {
    familyId: p.vehicle.familyId,
    vehicleId: p.vehicle._id,
    requestedBy: p.requester._id,
    command: p.command,
    ...(p.destination ? { destination: p.destination } : {}),
    status: 'pending',
    createdAt: p.now,
    expiresAt: p.now + VEHICLES.commandApprovalMinutes * MIN,
  });
  const messageId = await postOwnMegaMessage(ctx, p.vehicle.familyId, p.requester._id, {
    type: 'block',
    block: {
      kind: 'choice',
      prompt: VEHICLE_COPY.approvePrompt(commandLabel(p.command, p.destination?.label), p.vehicle.nickname),
      options: [{ id: 'approve', label: VEHICLE_COPY.approve }, { id: 'cancel', label: VEHICLE_COPY.cancel }],
      multi: false,
      allowOther: false,
    },
  }, p.now, { ruleBlock: 'vehicleCommand' });
  if (messageId) await ctx.db.patch(commandId, { messageId });
  return { commandId, messageId };
}

/** chat.answerBlock's rule handler for an approval block. Only the requester can answer; a repeat, stale or
 * expired answer never runs anything. Approve schedules the command (an action: it calls the provider). */
export async function answerVehicleCommand(ctx: MutationCtx, member: Doc<'members'>, message: Doc<'messages'>, answer: BlockAnswer, now: number): Promise<boolean> {
  if (message.ruleBlock !== 'vehicleCommand') return false;
  const command = await ctx.db.query('vehicleCommands').withIndex('by_message', (q) => q.eq('messageId', message._id)).unique();
  if (!command || command.familyId !== member.familyId) return true;
  if (command.requestedBy !== member._id) fail('FORBIDDEN');
  if (command.status !== 'pending') return true;
  const vehicle = await ctx.db.get(command.vehicleId);
  const decision = answer.optionIds?.length === 1 ? answer.optionIds[0] : undefined;
  if (decision !== 'approve' && decision !== 'cancel') fail('VALIDATION');
  if (!vehicle || !canReadVehicle(member, vehicle) || now > command.expiresAt) {
    await ctx.db.patch(command._id, { status: 'expired', decidedAt: now });
    await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'text', text: VEHICLE_COPY.expired }, now);
    return true;
  }
  if (decision === 'cancel') {
    await ctx.db.patch(command._id, { status: 'declined', decidedAt: now });
    await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'text', text: VEHICLE_COPY.declined }, now);
    return true;
  }
  await ctx.db.patch(command._id, { status: 'running', decidedAt: now });
  await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'text', text: VEHICLE_COPY.running(commandLabel(command.command, command.destination?.label)) }, now);
  await ctx.scheduler.runAfter(0, internal.vehicles.executeCommand, { commandId: command._id });
  return true;
}
