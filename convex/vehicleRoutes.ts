// HTTP entry points for connected cars (Vehicles addendum): the Smartcar webhook and the `mega-vehicle` MCP
// endpoint. convex/http.ts mounts them at VEHICLES.webhookPath and VEHICLES.mcpPath.
import { v } from 'convex/values';
import { VEHICLES } from '../shared/config/vehicles';
import { internal } from './_generated/api';
import { httpAction, internalAction, internalQuery } from './_generated/server';
import { getVehicles } from './adapters/registry';
import { vehicleCommandTool, vehicleStatusTool } from './agent/netTools';
import { trustedOrigins } from './auth';
import { readableVehicles } from './model/vehicles';
import { vehicleMcp } from './model/vehicleMcp';
import { requireViewer } from './model/viewer';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const MAX_BODY = 256 * 1024;

/** Smartcar webhook: every delivery is signature-checked over the exact raw body before anything is read. The
 * VERIFY challenge is answered with the HMAC Smartcar expects; a state delivery for a car no family linked (or
 * linked through a different grant) is acknowledged and dropped. Always 2xx once verified, so Smartcar never
 * retries something we deliberately ignored. */
export const webhook = httpAction(async (ctx, request) => {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response(null, { status: 413 });
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  const provider = getVehicles();
  const event = provider.webhook.parse(json);
  // VERIFY carries no signature of its own: the answer is an HMAC only the Management Token holder can produce.
  if (event.kind === 'verify') {
    const answer = await provider.webhook.answerChallenge(event.challenge);
    return answer ? new Response(JSON.stringify(answer), { status: 200, headers: JSON_HEADERS }) : new Response(null, { status: 503 });
  }
  if (!(await provider.webhook.verify(raw, request.headers))) return new Response(null, { status: 401 });
  if (event.kind === 'state') {
    const vehicleId = await ctx.runQuery(internal.vehicles.byProviderVehicle, { providerVehicleId: event.providerVehicleId, providerUserId: event.providerUserId });
    if (vehicleId) await ctx.runMutation(internal.vehicles.storeState, { vehicleId, state: event.state, eventId: event.eventId, ...(event.sequence !== undefined ? { sequence: event.sequence } : {}) });
  }
  return new Response(JSON.stringify({ status: 'received' }), { status: 200, headers: JSON_HEADERS });
});

export const callerVehicles = internalQuery({
  args: {},
  returns: v.object({ familyId: v.id('families'), memberId: v.id('members'), cars: v.array(v.object({ nickname: v.string(), make: v.string(), model: v.string(), isOwner: v.boolean() })) }),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const cars = await readableVehicles(ctx, viewer.member);
    return { familyId: viewer.member.familyId, memberId: viewer.member._id, cars: cars.map((c) => ({ nickname: c.nickname, make: c.make, model: c.model, isOwner: c.ownerId === viewer.member._id })) };
  },
});

/** Runs one MCP tool call as the signed-in caller (their auth flows into every query/mutation it runs). */
export const mcpExecute = internalAction({
  args: { name: v.string(), argumentsJson: v.string() },
  returns: v.object({ ok: v.boolean(), text: v.string() }),
  handler: async (ctx, { name, argumentsJson }): Promise<{ ok: boolean; text: string }> => {
    await ctx.runQuery(internal.vehicles.caller, {}); // adults only (FORBIDDEN otherwise)
    const caller = await ctx.runQuery(internal.vehicleRoutes.callerVehicles, {});
    const raw = JSON.parse(argumentsJson) as Record<string, unknown>;
    const who = { familyId: caller.familyId, memberId: caller.memberId };
    if (name === 'vehicle_list') {
      return { ok: true, text: caller.cars.length ? caller.cars.map((c) => `${c.nickname} (${[c.make, c.model].filter(Boolean).join(' ')})${c.isOwner ? ', yours' : ', shared'}`).join('\n') : 'No cars are linked yet.' };
    }
    if (name === 'vehicle_status') return { ok: true, text: await vehicleStatusTool(ctx, who, raw) };
    if (name === 'vehicle_command') {
      const r = await vehicleCommandTool(ctx, who, raw);
      return { ok: r.ok, text: r.resultText };
    }
    return { ok: false, text: `unknown tool "${name}"` };
  },
});

export const mcpGet = httpAction(async () => new Response(null, { status: 405, headers: { Allow: 'POST' } }));

/** Same transport rules as the creation MCP: the app's bearer session, allowed origins, one protocol version. */
export const mcpPost = httpAction(async (ctx, request) => {
  const origin = request.headers.get('Origin');
  const origins = [process.env.SITE_URL, ...trustedOrigins()].filter(Boolean);
  if (origin && !origins.includes(origin)) return new Response(null, { status: 403 });
  if (!(await ctx.auth.getUserIdentity())) return new Response(JSON.stringify({ error: 'Sign in to MEGA and supply a valid bearer session.' }), { status: 401, headers: JSON_HEADERS });
  const version = request.headers.get('MCP-Protocol-Version');
  if (version && version !== VEHICLES.mcpVersion) return new Response(null, { status: 400 });
  if (!request.headers.get('Content-Type')?.includes('application/json')) return new Response(null, { status: 415 });
  const raw = await request.text();
  if (raw.length > 16_384) return new Response(null, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }), { status: 400, headers: JSON_HEADERS }); }
  const response = await vehicleMcp(body, (name, args) => ctx.runAction(internal.vehicleRoutes.mcpExecute, { name, argumentsJson: JSON.stringify(args) }));
  return response === null ? new Response(null, { status: 202 }) : new Response(JSON.stringify(response), { headers: JSON_HEADERS });
});
