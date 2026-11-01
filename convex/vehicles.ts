// Connected cars (Vehicles addendum, pending approval): `vehicles.*` plus the internal functions the webhook route,
// the agent tools and the MCP endpoint share. The provider is called only from actions, through the Vehicles port
// (convex/adapters/registry.ts → getVehicles()); access rules live in convex/model/vehicles.ts.
import { v } from 'convex/values';
import { VEHICLE_COPY, VEHICLES } from '../shared/config/vehicles';
import { API } from '../shared/domain/api';
import { vehicleCommandKind, vehicleSharing, vehicleState, type VehicleState } from '../shared/domain/vehicles';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx } from './_generated/server';
import { getVehicles } from './adapters/registry';
import { pick } from './model/define';
import { fail } from './model/errors';
import { isGeocoded, placeByLabel, requireFamilyPlace } from './model/places';
import { postOwnMegaMessage } from './model/threads';
import { applyVehicleState, canReadVehicle, commandLabel, createCommandRequest, defaultNickname, isVehicleRole, readableVehicles, requireReadableVehicle, vehicleByName, whereLabel } from './model/vehicles';
import { requireViewer } from './model/viewer';
import { clock } from './ports/clock';
import type { IntegrationResult } from './ports/integrationResult';
import type { VehicleCommandInput, VehicleConnection } from './ports/vehicles';

function cleanNickname(raw: string | undefined, fallback: string): string {
  const name = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (name.length > VEHICLES.limits.nicknameMaxLength) fail('VALIDATION', `a car's name can be up to ${VEHICLES.limits.nicknameMaxLength} characters`);
  return name || fallback;
}

async function requireOwned(ctx: Parameters<typeof requireViewer>[0], vehicleId: Id<'vehicles'>) {
  const viewer = await requireViewer(ctx);
  const vehicle = await ctx.db.get(vehicleId);
  if (!vehicle || !canReadVehicle(viewer.member, vehicle)) fail('NOT_FOUND');
  if (vehicle.ownerId !== viewer.member._id) fail('FORBIDDEN', 'only the person who linked this car can change it');
  return { viewer, vehicle };
}

// ---------- public ----------

export const list = query({
  ...pick(API.vehicles.list),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const cars = await readableVehicles(ctx, viewer.member);
    return Promise.all(cars.map(async (c) => ({
      id: c._id,
      nickname: c.nickname,
      make: c.make,
      model: c.model,
      ...(c.year !== undefined ? { year: c.year } : {}),
      ...(c.powertrain ? { powertrain: c.powertrain } : {}),
      mode: c.mode,
      sharing: c.sharing,
      ownerId: c.ownerId,
      isOwner: c.ownerId === viewer.member._id,
      ...(c.state ? { state: await publicState(ctx, c.familyId, c.state) } : {}),
    })));
  },
});

async function publicState(ctx: Parameters<typeof whereLabel>[0], familyId: Id<'families'>, s: VehicleState) {
  const { location, ...rest } = s;
  const where = await whereLabel(ctx, familyId, location);
  return { ...rest, ...(where ? { where } : {}) };
}

/** Cars this member may claim: ones connected with their own owner tag, plus (demo setting) simulated cars
 * nobody tagged. Never another member's or family's car, even though the app token lists them all. */
async function claimable(ctx: ActionCtx, caller: { familyId: Id<'families'>; memberId: Id<'members'> }): Promise<VehicleConnection[]> {
  const provider = getVehicles();
  const r = await provider.listConnections();
  if (!r.ok) fail('VALIDATION', r.failure === 'not_configured' ? VEHICLE_COPY.notConfigured : VEHICLE_COPY.unavailable);
  const tag = await provider.ownerTag(`${caller.familyId}:${caller.memberId}`);
  const mine = r.connections.filter((c) => (tag !== null && c.externalId === tag) || (VEHICLES.allowUnclaimedSimulated && c.mode === 'simulated' && !c.externalId));
  const linked = new Set<string>(await ctx.runQuery(internal.vehicles.linkedProviderIds, { providerVehicleIds: mine.map((c) => c.providerVehicleId) }));
  return mine.filter((c) => !linked.has(c.providerVehicleId));
}

export const available = action({
  ...pick(API.vehicles.available),
  handler: async (ctx): Promise<Omit<VehicleConnection, 'providerUserId' | 'externalId'>[]> => {
    const caller = await ctx.runQuery(internal.vehicles.caller, {});
    return (await claimable(ctx, caller)).map(({ providerUserId: _user, externalId: _tag, ...rest }) => rest);
  },
});

export const connectUrl = action({
  ...pick(API.vehicles.connectUrl),
  handler: async (ctx, { mode }): Promise<{ url: string }> => {
    const caller = await ctx.runQuery(internal.vehicles.caller, {});
    const provider = getVehicles();
    const tag = await provider.ownerTag(`${caller.familyId}:${caller.memberId}`);
    const url = tag ? provider.connectUrl(tag, mode ?? 'live') : null;
    if (!url) fail('VALIDATION', VEHICLE_COPY.notConfigured);
    return { url };
  },
});

export const link = action({
  ...pick(API.vehicles.link),
  handler: async (ctx, args): Promise<Id<'vehicles'>> => {
    const caller = await ctx.runQuery(internal.vehicles.caller, {});
    const found = (await claimable(ctx, caller)).find((c) => c.providerVehicleId === args.providerVehicleId);
    if (!found) fail('NOT_FOUND');
    const { externalId: _tag, ...connection } = found;
    const vehicleId = await ctx.runMutation(internal.vehicles.insertLinked, {
      familyId: caller.familyId,
      ownerId: caller.memberId,
      connection,
      nickname: cleanNickname(args.nickname, defaultNickname(connection.make, connection.model)),
      sharing: args.sharing ?? 'private',
    });
    await refreshNow(ctx, vehicleId);
    return vehicleId;
  },
});

export const update = mutation({
  ...pick(API.vehicles.update),
  handler: async (ctx, args) => {
    const { vehicle } = await requireOwned(ctx, args.vehicleId);
    await ctx.db.patch(vehicle._id, {
      ...(args.nickname !== undefined ? { nickname: cleanNickname(args.nickname, vehicle.nickname) } : {}),
      ...(args.sharing !== undefined ? { sharing: args.sharing } : {}),
    });
    return null;
  },
});

export const unlink = mutation({
  ...pick(API.vehicles.unlink),
  handler: async (ctx, { vehicleId }) => {
    const { vehicle } = await requireOwned(ctx, vehicleId);
    const commands = await ctx.db.query('vehicleCommands').withIndex('by_family_vehicle', (q) => q.eq('familyId', vehicle.familyId).eq('vehicleId', vehicle._id)).collect();
    for (const c of commands) await ctx.db.delete(c._id);
    await ctx.db.delete(vehicle._id);
    return null;
  },
});

export const refresh = action({
  ...pick(API.vehicles.refresh),
  handler: async (ctx, { vehicleId }): Promise<null> => {
    await ctx.runQuery(internal.vehicles.readerCheck, { vehicleId });
    const r = await refreshNow(ctx, vehicleId);
    if (!r.ok) fail('VALIDATION', r.failure === 'not_configured' ? VEHICLE_COPY.notConfigured : VEHICLE_COPY.unavailable);
    return null;
  },
});

export const requestCommand = mutation({
  ...pick(API.vehicles.requestCommand),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const vehicle = await requireReadableVehicle(ctx, viewer.member, args.vehicleId);
    const now = await clock.now(ctx, viewer.member.familyId);
    let destination: { label: string; lat: number; lng: number } | undefined;
    if (args.command === 'set_destination') {
      if (!args.placeId) fail('VALIDATION', 'pick a saved place to send');
      const place = await requireFamilyPlace(ctx, viewer.member.familyId, args.placeId);
      if (!isGeocoded(place)) fail('VALIDATION', "that place doesn't have a map location yet");
      destination = { label: place.label, lat: place.lat, lng: place.lng };
    }
    const { commandId } = await createCommandRequest(ctx, { vehicle, requester: viewer.member, command: args.command, destination, now });
    return { commandId };
  },
});

// ---------- internal: callers, linking, readings ----------

export const caller = internalQuery({
  args: {},
  returns: v.object({ familyId: v.id('families'), memberId: v.id('members') }),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (!isVehicleRole(viewer.member.role)) fail('FORBIDDEN', 'only grown-ups can connect a car');
    return { familyId: viewer.member.familyId, memberId: viewer.member._id };
  },
});

export const readerCheck = internalQuery({
  args: { vehicleId: v.id('vehicles') },
  returns: v.null(),
  handler: async (ctx, { vehicleId }) => {
    const viewer = await requireViewer(ctx);
    await requireReadableVehicle(ctx, viewer.member, vehicleId);
    return null;
  },
});

export const linkedProviderIds = internalQuery({
  args: { providerVehicleIds: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, { providerVehicleIds }) => {
    const out: string[] = [];
    for (const id of providerVehicleIds) {
      const row = await ctx.db.query('vehicles').withIndex('by_provider_vehicle', (q) => q.eq('provider', VEHICLES.provider).eq('providerVehicleId', id)).first();
      if (row) out.push(id);
    }
    return out;
  },
});

const connectionArg = v.object({
  providerVehicleId: v.string(),
  providerUserId: v.string(),
  make: v.string(),
  model: v.string(),
  year: v.optional(v.number()),
  mode: v.union(v.literal('live'), v.literal('simulated')),
  powertrain: v.optional(v.string()),
});

export const insertLinked = internalMutation({
  args: { familyId: v.id('families'), ownerId: v.id('members'), connection: connectionArg, nickname: v.string(), sharing: vehicleSharing },
  returns: v.id('vehicles'),
  handler: async (ctx, { familyId, ownerId, connection, nickname, sharing }) => {
    const existing = await ctx.db.query('vehicles').withIndex('by_provider_vehicle', (q) => q.eq('provider', VEHICLES.provider).eq('providerVehicleId', connection.providerVehicleId)).first();
    if (existing) {
      if (existing.familyId !== familyId) fail('NOT_FOUND');
      return existing._id;
    }
    const count = (await ctx.db.query('vehicles').withIndex('by_family', (q) => q.eq('familyId', familyId)).collect()).length;
    if (count >= VEHICLES.limits.perFamily) fail('VALIDATION', `a family can link up to ${VEHICLES.limits.perFamily} cars`);
    return ctx.db.insert('vehicles', {
      familyId,
      ownerId,
      provider: VEHICLES.provider,
      providerVehicleId: connection.providerVehicleId,
      providerUserId: connection.providerUserId,
      mode: connection.mode,
      make: connection.make,
      model: connection.model,
      ...(connection.year !== undefined ? { year: connection.year } : {}),
      ...(connection.powertrain ? { powertrain: connection.powertrain } : {}),
      nickname,
      sharing,
      linkedAt: await clock.now(ctx, familyId),
    });
  },
});

export const refInfo = internalQuery({
  args: { vehicleId: v.id('vehicles') },
  returns: v.union(v.null(), v.object({ providerVehicleId: v.string(), providerUserId: v.string() })),
  handler: async (ctx, { vehicleId }) => {
    const c = await ctx.db.get(vehicleId);
    return c ? { providerVehicleId: c.providerVehicleId, providerUserId: c.providerUserId } : null;
  },
});

/** Stores a reading (on-demand or webhook) and raises any alert it starts. A webhook delivery older than the
 * last one applied (by `sequence`) or one already applied (by `eventId`) changes nothing. */
export const storeState = internalMutation({
  args: { vehicleId: v.id('vehicles'), state: vehicleState, eventId: v.optional(v.string()), sequence: v.optional(v.number()) },
  returns: v.array(v.string()),
  handler: async (ctx, { vehicleId, state, eventId, sequence }) => {
    const vehicle = await ctx.db.get(vehicleId);
    if (!vehicle) return [];
    if (eventId && vehicle.lastEventId === eventId) return [];
    if (sequence !== undefined && vehicle.lastSequence !== undefined && sequence < vehicle.lastSequence) return [];
    if (eventId || sequence !== undefined) await ctx.db.patch(vehicle._id, { ...(eventId ? { lastEventId: eventId } : {}), ...(sequence !== undefined ? { lastSequence: sequence } : {}) });
    // Webhooks carry only the subscribed signals: keep earlier values the delivery didn't include.
    const merged: VehicleState = { ...(vehicle.state ?? {}), ...state, readAt: state.readAt };
    return applyVehicleState(ctx, { ...vehicle, ...(eventId ? { lastEventId: eventId } : {}) }, merged, await clock.now(ctx, vehicle.familyId));
  },
});

export async function refreshNow(ctx: ActionCtx, vehicleId: Id<'vehicles'>): Promise<IntegrationResult<{ state: VehicleState }>> {
  const ref = await ctx.runQuery(internal.vehicles.refInfo, { vehicleId });
  if (!ref) return { ok: false, failure: 'no_result' };
  const r = await getVehicles().readState(ref);
  if (r.ok) await ctx.runMutation(internal.vehicles.storeState, { vehicleId, state: r.state });
  return r;
}

export const byProviderVehicle = internalQuery({
  args: { providerVehicleId: v.string(), providerUserId: v.string() },
  returns: v.union(v.null(), v.id('vehicles')),
  handler: async (ctx, { providerVehicleId, providerUserId }) => {
    const row = await ctx.db.query('vehicles').withIndex('by_provider_vehicle', (q) => q.eq('provider', VEHICLES.provider).eq('providerVehicleId', providerVehicleId)).first();
    // The webhook's user must be the one the car was linked through, or the delivery is about someone else's grant.
    return row && row.providerUserId === providerUserId ? row._id : null;
  },
});

// ---------- internal: commands ----------

export const commandInfo = internalQuery({
  args: { commandId: v.id('vehicleCommands') },
  returns: v.union(v.null(), v.object({
    command: vehicleCommandKind,
    vehicleId: v.id('vehicles'),
    destination: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    ref: v.object({ providerVehicleId: v.string(), providerUserId: v.string() }),
  })),
  handler: async (ctx, { commandId }) => {
    const command = await ctx.db.get(commandId);
    const vehicle = command ? await ctx.db.get(command.vehicleId) : null;
    if (!command || !vehicle || command.status !== 'running') return null;
    return {
      command: command.command,
      vehicleId: command.vehicleId,
      ...(command.destination ? { destination: { lat: command.destination.lat, lng: command.destination.lng } } : {}),
      ref: { providerVehicleId: vehicle.providerVehicleId, providerUserId: vehicle.providerUserId },
    };
  },
});

export const finishCommand = internalMutation({
  args: { commandId: v.id('vehicleCommands'), ok: v.boolean(), failure: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { commandId, ok, failure }) => {
    const command = await ctx.db.get(commandId);
    if (!command || command.status !== 'running') return null;
    const now = await clock.now(ctx, command.familyId);
    await ctx.db.patch(commandId, { status: ok ? 'succeeded' : 'failed', finishedAt: now, ...(failure ? { failure } : {}) });
    const label = commandLabel(command.command, command.destination?.label);
    await postOwnMegaMessage(ctx, command.familyId, command.requestedBy, { type: 'text', text: ok ? VEHICLE_COPY.succeeded(label) : VEHICLE_COPY.failed(label, friendlyFailure(failure)) }, now);
    return null;
  },
});

function friendlyFailure(code?: string): string {
  if (!code) return 'the car didn\'t respond';
  if (code.includes('IN_MOTION')) return 'the car is moving';
  if (code.includes('not_configured')) return 'car features aren\'t set up';
  if (code.includes('NOT_CAPABLE') || code.includes('COMPATIBILITY')) return 'this car doesn\'t support that';
  if (code.includes('unauthorized') || code.includes('PERMISSION')) return 'MEGA doesn\'t have permission for that';
  return 'the car didn\'t respond';
}

/** Runs an approved command (scheduled by `answerVehicleCommand`), then reads the car so the stored state matches. */
export const executeCommand = internalAction({
  args: { commandId: v.id('vehicleCommands') },
  returns: v.null(),
  handler: async (ctx, { commandId }): Promise<null> => {
    const info = await ctx.runQuery(internal.vehicles.commandInfo, { commandId });
    if (!info) return null;
    let input: VehicleCommandInput;
    if (info.command === 'set_destination') {
      if (!info.destination) {
        await ctx.runMutation(internal.vehicles.finishCommand, { commandId, ok: false, failure: 'no destination' });
        return null;
      }
      input = { command: 'set_destination', destination: info.destination };
    } else {
      input = { command: info.command };
    }
    const r = await getVehicles().command(info.ref, input);
    await ctx.runMutation(internal.vehicles.finishCommand, { commandId, ok: r.ok, ...(r.ok ? {} : { failure: r.detail ?? r.failure }) });
    if (r.ok && info.command !== 'set_destination') await refreshNow(ctx, info.vehicleId);
    return null;
  },
});

/** Shared by the agent tool and the MCP endpoint: a pending command for a member, by car name. */
export const requestCommandFor = internalMutation({
  args: { memberId: v.id('members'), vehicleName: v.optional(v.string()), command: vehicleCommandKind, placeLabel: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean(), text: v.string() }),
  handler: async (ctx, a) => {
    const member = await ctx.db.get(a.memberId);
    if (!member || !isVehicleRole(member.role)) return { ok: false, text: VEHICLE_COPY.noCar };
    const vehicle = await vehicleByName(ctx, member, a.vehicleName);
    if (!vehicle) return { ok: false, text: VEHICLE_COPY.noCar };
    let destination: { label: string; lat: number; lng: number } | undefined;
    if (a.command === 'set_destination') {
      const place = a.placeLabel ? await placeByLabel(ctx, member.familyId, a.placeLabel) : null;
      if (!place || !isGeocoded(place)) return { ok: false, text: 'That needs a saved family place with a map location.' };
      destination = { label: place.label, lat: place.lat, lng: place.lng };
    }
    const now = await clock.now(ctx, member.familyId);
    await createCommandRequest(ctx, { vehicle, requester: member, command: a.command, destination, now });
    return { ok: true, text: `An Approve / Cancel card for "${commandLabel(a.command, destination?.label)}" on ${vehicle.nickname} is in their chat. Nothing happens until they tap Approve.` };
  },
});
