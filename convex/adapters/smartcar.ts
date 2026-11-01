// The real Vehicles adapter: Smartcar. The only file that knows Smartcar's URLs and JSON. Docs read Oct 31, 2026:
// - API Authentication: POST iam.smartcar.com/oauth2/token (form, grant_type=client_credentials), 1-hour token,
//   no refresh token. One application-level token covers every connected car; per-car calls add `sc-user-id`.
// - Connections: GET /v3/connections (page[number], page[size]); the car's id is at
//   data[].relationships.vehicle.data.id, the owner at data[].attributes.user.id.
// - Signals: GET /v3/vehicles/{id}/signals → data[].attributes { code, status.value, body } (units in each body).
// - Commands: POST /v3/vehicles/{id}/commands/security/lock|unlock, /navigation/set-destination
//   ({ data: { attributes: { latitude, longitude } } }); final result in data.attributes.status.value. A slow
//   command answers 202 first and streams the final body on the same connection.
// - Webhooks: `SC-Signature` = hex HMAC-SHA256 of the raw body keyed by the Application Management Token; the
//   VERIFY challenge is answered with { challenge: hex HMAC-SHA256(challenge) }. VEHICLE_STATE carries
//   data.vehicle.id, data.user.id and data.signals[] { code, body, status?, meta.retrievedAt }.
import { VEHICLES } from '../../shared/config/vehicles';
import type { TirePressures, VehicleState } from '../../shared/domain/vehicles';
import { clock } from '../ports/clock';
import type { IntegrationFailure, IntegrationResult } from '../ports/integrationResult';
import type { VehicleCommandInput, VehicleConnection, VehicleRef, Vehicles, VehicleWebhookEvent } from '../ports/vehicles';

const KM_TO_MI = 0.621371;
const KPA_TO_PSI = 0.145038;

type Raw = Record<string, unknown>;
const obj = (x: unknown): Raw | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Raw) : null);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const str = (x: unknown): string | null => (typeof x === 'string' && x.length > 0 ? x : null);
const round = (x: number, places = 0) => Math.round(x * 10 ** places) / 10 ** places;

// ---------- normalizing signals (shared by the REST read and webhook payloads) ----------

export type RawSignal = { code: string; body?: unknown; ok: boolean; retrievedAt?: number };

function miles(body: Raw): number | null {
  const value = num(body.value);
  if (value === null) return null;
  const unit = String(body.unit ?? 'km').toLowerCase();
  return round(unit.startsWith('mi') ? value : value * KM_TO_MI);
}

function percent(body: Raw): number | null {
  const value = num(body.value);
  if (value === null) return null;
  // v3 bodies are { value: 0–100, unit: 'percent' }; a bare fraction (legacy simulator) is scaled up.
  return round(body.unit === undefined && value <= 1 ? value * 100 : value);
}

function tires(body: Raw): TirePressures | null {
  const values = Array.isArray(body.values) ? body.values : [];
  const unit = String(body.unit ?? 'kPa').toLowerCase();
  const out: TirePressures = {};
  for (const raw of values) {
    const t = obj(raw);
    const p = t ? num(t.tirePressure) : null;
    if (!t || p === null) continue;
    const psi = round(unit === 'psi' ? p : p * KPA_TO_PSI, 1);
    const key = `${t.row === 0 ? 'front' : 'rear'}${t.column === 0 ? 'Left' : 'Right'}` as keyof TirePressures;
    out[key] = psi;
  }
  return Object.keys(out).length ? out : null;
}

/** Signals → the normalized state. Unknown codes and errored signals are skipped, never guessed. */
export function stateFromSignals(signals: RawSignal[], fallbackReadAt: number): VehicleState {
  const s = VEHICLES.signals;
  const state: Omit<VehicleState, 'readAt'> = {};
  let readAt = 0;
  for (const sig of signals) {
    const body = obj(sig.body);
    if (!sig.ok || !body) continue;
    if (sig.retrievedAt) readAt = Math.max(readAt, sig.retrievedAt);
    switch (sig.code) {
      case s.fuelPct: { const v = percent(body); if (v !== null) state.fuelPct = v; break; }
      case s.batteryPct: { const v = percent(body); if (v !== null) state.batteryPct = v; break; }
      case s.oilLifePct: { const v = percent(body); if (v !== null) state.oilLifePct = v; break; }
      case s.fuelRange:
      case s.batteryRange: { const v = miles(body); if (v !== null) state.rangeMiles = v; break; }
      case s.odometer: { const v = miles(body); if (v !== null) state.odometerMiles = v; break; }
      case s.tires: { const v = tires(body); if (v) state.tiresPsi = v; break; }
      case s.isLocked: if (typeof body.value === 'boolean') state.isLocked = body.value; break;
      case s.isCharging: if (typeof body.value === 'boolean') state.isCharging = body.value; break;
      case s.location: {
        const lat = num(body.latitude);
        const lng = num(body.longitude);
        if (lat !== null && lng !== null) state.location = { lat, lng };
        break;
      }
    }
  }
  return { ...state, readAt: readAt || fallbackReadAt };
}

const isoMs = (x: unknown): number | undefined => {
  if (typeof x === 'number') return x;
  const t = typeof x === 'string' ? Date.parse(x) : NaN;
  return Number.isFinite(t) ? t : undefined;
};

function restSignals(json: unknown): RawSignal[] {
  const data = obj(json)?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((d) => {
    const a = obj(obj(d)?.attributes);
    const code = a ? str(a.code) : null;
    if (!a || !code) return [];
    return [{ code, body: a.body, ok: obj(a.status)?.value === 'SUCCESS' || (a.status === undefined && a.body !== undefined), retrievedAt: isoMs(obj(obj(d)?.meta)?.retrievedAt) }];
  });
}

function webhookSignals(signals: unknown): RawSignal[] {
  if (!Array.isArray(signals)) return [];
  return signals.flatMap((raw) => {
    const sig = obj(raw);
    const code = sig ? str(sig.code) : null;
    if (!sig || !code) return [];
    const errored = obj(sig.status)?.value === 'ERROR';
    return [{ code, body: sig.body, ok: !errored && sig.body !== undefined, retrievedAt: isoMs(obj(sig.meta)?.retrievedAt) }];
  });
}

// ---------- HTTP ----------

function secret(name: string): string | null {
  return process.env[name] || null;
}

type Res = { ok: true; status: number; json: unknown } | { ok: false; failure: IntegrationFailure; detail: string };

function failureFor(status: number, json: unknown): { failure: IntegrationFailure; detail: string } {
  const b = obj(json);
  const detail = [str(b?.type), str(b?.code)].filter(Boolean).join(':') || `HTTP ${status}`;
  if (status === 401 || status === 403) return { failure: 'unauthorized', detail };
  if (status === 404) return { failure: 'no_result', detail };
  if (status === 429) return { failure: 'rate_limited', detail };
  return { failure: 'error', detail };
}

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Res> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, json };
    return { ok: false, ...failureFor(res.status, json) };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { ok: false, failure: 'error', detail: aborted ? 'timed out' : 'network error' };
  } finally {
    clearTimeout(timer);
  }
}

let cachedToken: { clientId: string; token: string; expiresAt: number } | null = null;

/** Test-only: forget the cached application token. */
export function __resetSmartcarTokenForTests(): void {
  cachedToken = null;
}

async function appToken(): Promise<IntegrationResult<{ token: string }>> {
  const clientId = secret(VEHICLES.env.clientId);
  const clientSecret = secret(VEHICLES.env.clientSecret);
  if (!clientId || !clientSecret) return { ok: false, failure: 'not_configured' };
  // Real time on purpose: the token's lifetime is the provider's, not the family's (simulated) clock.
  const now = clock.realNow();
  if (cachedToken && cachedToken.clientId === clientId && cachedToken.expiresAt > now) return { ok: true, token: cachedToken.token };
  const res = await request(VEHICLES.api.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
  }, VEHICLES.api.timeoutMs);
  if (!res.ok) return res;
  const b = obj(res.json);
  const token = str(b?.access_token);
  if (!token) return { ok: false, failure: 'error', detail: 'no access_token' };
  const ttl = num(b?.expires_in) ?? 3600;
  cachedToken = { clientId, token, expiresAt: now + Math.max(60, ttl - VEHICLES.api.tokenRefreshMarginSeconds) * 1000 };
  return { ok: true, token };
}

async function authed(path: string, init: RequestInit & { userId?: string }, timeoutMs: number = VEHICLES.api.timeoutMs): Promise<Res> {
  const t = await appToken();
  if (!t.ok) return { ok: false, failure: t.failure, detail: t.detail ?? t.failure };
  const { userId, ...rest } = init;
  const headers: Record<string, string> = { Authorization: `Bearer ${t.token}`, Accept: 'application/json', ...(userId ? { 'sc-user-id': userId } : {}) };
  if (rest.body) headers['Content-Type'] = 'application/json';
  const res = await request(`${VEHICLES.api.vehicleBase}${path}`, { ...rest, headers }, timeoutMs);
  // A token revoked early (secret rotated) — drop it so the next call asks for a new one.
  if (!res.ok && res.failure === 'unauthorized') cachedToken = null;
  return res;
}

export function parseConnections(json: unknown): VehicleConnection[] {
  const data = obj(json)?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((d) => {
    const c = obj(d);
    const attrs = obj(c?.attributes);
    const vehicle = obj(attrs?.vehicle);
    const providerVehicleId = str(obj(obj(obj(c?.relationships)?.vehicle)?.data)?.id);
    const providerUserId = str(obj(attrs?.user)?.id);
    if (!providerVehicleId || !providerUserId || !vehicle) return [];
    const year = num(vehicle.year);
    const powertrain = str(vehicle.powertrainType);
    const externalId = str(obj(attrs?.user)?.externalId);
    return [{
      providerVehicleId,
      providerUserId,
      make: str(vehicle.make) ?? 'Car',
      model: str(vehicle.model) ?? '',
      ...(year !== null ? { year } : {}),
      mode: vehicle.mode === 'simulated' ? 'simulated' as const : 'live' as const,
      ...(powertrain ? { powertrain } : {}),
      ...(externalId ? { externalId } : {}),
    }];
  });
}

const COMMAND_PATHS: Record<VehicleCommandInput['command'], string> = {
  lock: 'commands/security/lock',
  unlock: 'commands/security/unlock',
  set_destination: 'commands/navigation/set-destination',
};

// ---------- webhook signatures (Web Crypto, runs in Convex's default runtime) ----------

async function hmacKey(secretValue: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secretValue), { name: 'HMAC', hash: 'SHA-256' }, false, usage);
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function hmacHex(secretValue: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secretValue, ['sign']), new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyHmacHex(secretValue: string, message: string, signatureHex: string | null): Promise<boolean> {
  const bytes = signatureHex ? hexToBytes(signatureHex.trim()) : null;
  if (!bytes) return false;
  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify('HMAC', await hmacKey(secretValue, ['verify']), bytes, new TextEncoder().encode(message));
}

export function parseWebhook(json: unknown): VehicleWebhookEvent {
  const b = obj(json);
  if (!b) return { kind: 'ignored', reason: 'not an object' };
  const eventId = str(b.eventId) ?? undefined;
  const data = obj(b.data);
  if (b.eventType === 'VERIFY') {
    const challenge = str(data?.challenge);
    return challenge ? { kind: 'verify', challenge } : { kind: 'ignored', eventId, reason: 'verify without challenge' };
  }
  if (b.eventType !== 'VEHICLE_STATE' || !eventId) return { kind: 'ignored', eventId, reason: `event ${String(b.eventType ?? b.eventName ?? 'unknown')}` };
  const providerVehicleId = str(obj(data?.vehicle)?.id);
  const providerUserId = str(obj(data?.user)?.id);
  if (!providerVehicleId || !providerUserId) return { kind: 'ignored', eventId, reason: 'no vehicle or user' };
  const meta = obj(b.meta);
  const deliveredAt = isoMs(meta?.deliveredAt) ?? 0;
  const sequence = num(meta?.sequence);
  return { kind: 'state', eventId, ...(sequence !== null ? { sequence } : {}), providerVehicleId, providerUserId, state: stateFromSignals(webhookSignals(data?.signals), deliveredAt) };
}

export const smartcarVehicles: Vehicles = {
  async ownerTag(ownerKey) {
    const key = secret(VEHICLES.env.clientSecret);
    return key ? `mega-${(await hmacHex(key, `vehicle-owner:${ownerKey}`)).slice(0, 40)}` : null;
  },

  connectUrl(ownerTag, mode) {
    const applicationId = secret(VEHICLES.env.applicationId);
    if (!applicationId) return null;
    const q = new URLSearchParams({ application_id: applicationId, external_id: ownerTag, response_type: 'none', mode });
    return `${VEHICLES.api.connectUrl}?${q.toString()}`;
  },

  async listConnections() {
    const connections: VehicleConnection[] = [];
    for (let page = 1; page <= VEHICLES.api.maxConnectionPages; page++) {
      const q = new URLSearchParams({ 'page[number]': String(page), 'page[size]': String(VEHICLES.api.connectionsPageSize) });
      const res = await authed(`/connections?${q.toString()}`, { method: 'GET' });
      if (!res.ok) return res;
      connections.push(...parseConnections(res.json));
      const next = obj(obj(res.json)?.links)?.next;
      if (!next) break;
    }
    return { ok: true, connections };
  },

  async readState(ref: VehicleRef) {
    const res = await authed(`/vehicles/${encodeURIComponent(ref.providerVehicleId)}/signals`, { method: 'GET', userId: ref.providerUserId });
    if (!res.ok) return res;
    const signals = restSignals(res.json);
    if (!signals.length) return { ok: false, failure: 'no_result', detail: 'no signals' };
    return { ok: true, state: stateFromSignals(signals, clock.realNow()) };
  },

  async command(ref: VehicleRef, input: VehicleCommandInput) {
    const body = input.command === 'set_destination' ? JSON.stringify({ data: { attributes: { latitude: input.destination.lat, longitude: input.destination.lng } } }) : undefined;
    const res = await authed(`/vehicles/${encodeURIComponent(ref.providerVehicleId)}/${COMMAND_PATHS[input.command]}`, { method: 'POST', userId: ref.providerUserId, ...(body ? { body } : {}) }, VEHICLES.api.commandTimeoutMs);
    if (!res.ok) return res;
    const attrs = obj(obj(obj(res.json)?.data)?.attributes);
    const status = obj(attrs?.status);
    if (status?.value === 'SUCCESS') return { ok: true, status: 'succeeded' as const };
    const err = obj(status?.error) ?? obj(attrs?.error);
    return { ok: false, failure: 'error', detail: [str(err?.type), str(err?.code)].filter(Boolean).join(':') || String(status?.value ?? 'unknown') };
  },

  webhook: {
    async verify(rawBody, headers) {
      const key = secret(VEHICLES.env.managementToken);
      if (!key) return false;
      return verifyHmacHex(key, rawBody, headers.get('SC-Signature'));
    },
    async answerChallenge(challenge) {
      const key = secret(VEHICLES.env.managementToken);
      return key ? { challenge: await hmacHex(key, challenge) } : null;
    },
    parse: parseWebhook,
  },
};
