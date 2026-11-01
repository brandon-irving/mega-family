// The Fake Vehicles adapter: no network. Tests script it with `makeFakeVehicles` and install it through
// `__setVehiclesForTests`; it is also the default when MEGA_MODEL_ADAPTER isn't `real`. Its webhook signatures
// use the same HMAC scheme as Smartcar, keyed by FAKE_VEHICLE_WEBHOOK_KEY, so the HTTP route is tested for real.
import type { VehicleState } from '../../shared/domain/vehicles';
import type { IntegrationFailure } from '../ports/integrationResult';
import type { VehicleCommandInput, VehicleConnection, VehicleRef, Vehicles } from '../ports/vehicles';
import { hmacHex, parseWebhook, verifyHmacHex } from './smartcar';

export const FAKE_VEHICLE_WEBHOOK_KEY = 'fake-management-key';

export const FAKE_CONNECTION: VehicleConnection = {
  providerVehicleId: 'veh_fake_minivan',
  providerUserId: 'usr_fake_owner',
  make: 'Simulated',
  model: 'ICE',
  year: 2024,
  mode: 'simulated',
  powertrain: 'ICE',
};

export const FAKE_STATE: Omit<VehicleState, 'readAt'> = {
  fuelPct: 42,
  rangeMiles: 168,
  odometerMiles: 23_410,
  oilLifePct: 64,
  tiresPsi: { frontLeft: 33, frontRight: 33, rearLeft: 34, rearRight: 34 },
  isLocked: true,
  location: { lat: 37.7749, lng: -122.4194 },
};

export interface FakeVehicles extends Vehicles {
  calls: string[];
  setState(providerVehicleId: string, state: Omit<VehicleState, 'readAt'>): void;
}

export function makeFakeVehicles(opts: {
  connections?: VehicleConnection[];
  states?: Record<string, Omit<VehicleState, 'readAt'>>;
  failWith?: IntegrationFailure;
  commandFailure?: string;
  readAt?: number;
} = {}): FakeVehicles {
  const connections = opts.connections ?? [FAKE_CONNECTION];
  const states: Record<string, Omit<VehicleState, 'readAt'>> = { ...(opts.states ?? { [FAKE_CONNECTION.providerVehicleId]: FAKE_STATE }) };
  const calls: string[] = [];
  return {
    calls,
    setState(id, state) {
      states[id] = state;
    },
    async listConnections() {
      calls.push('listConnections');
      if (opts.failWith) return { ok: false, failure: opts.failWith };
      return { ok: true, connections };
    },
    async readState(ref: VehicleRef) {
      calls.push(`readState:${ref.providerVehicleId}`);
      if (opts.failWith) return { ok: false, failure: opts.failWith };
      const s = states[ref.providerVehicleId];
      if (!s) return { ok: false, failure: 'no_result' };
      return { ok: true, state: { ...s, readAt: opts.readAt ?? 1_000 } };
    },
    async command(ref: VehicleRef, input: VehicleCommandInput) {
      calls.push(`command:${ref.providerVehicleId}:${input.command}`);
      if (opts.failWith) return { ok: false, failure: opts.failWith };
      if (opts.commandFailure) return { ok: false, failure: 'error', detail: opts.commandFailure };
      const s = states[ref.providerVehicleId];
      if (s && (input.command === 'lock' || input.command === 'unlock')) states[ref.providerVehicleId] = { ...s, isLocked: input.command === 'lock' };
      return { ok: true, status: 'succeeded' };
    },
    webhook: {
      verify: (rawBody, headers) => verifyHmacHex(FAKE_VEHICLE_WEBHOOK_KEY, rawBody, headers.get('SC-Signature')),
      answerChallenge: async (challenge) => ({ challenge: await hmacHex(FAKE_VEHICLE_WEBHOOK_KEY, challenge) }),
      parse: parseWebhook,
    },
  };
}

export const defaultFakeVehicles: Vehicles = makeFakeVehicles();
