// The Vehicles port (Vehicles addendum, pending approval): connected cars. Feature code reads normalized shapes
// only (shared/domain/vehicles.ts); one adapter per provider (convex/adapters/smartcar.ts today), chosen by
// convex/adapters/registry.ts. Like every integration port it fails closed: a missing secret, an unknown car or
// a provider error is `{ ok: false, failure }`, never a thrown vendor error and never a made-up value.
import type { VehicleCommandKind, VehicleState } from '../../shared/domain/vehicles';
import type { IntegrationResult } from './integrationResult';

/** A car the provider says is connected to this application (not yet necessarily linked to a family). */
export interface VehicleConnection {
  providerVehicleId: string;
  providerUserId: string;
  make: string;
  model: string;
  year?: number;
  mode: 'live' | 'simulated';
  powertrain?: string;
}

export interface VehicleRef {
  providerVehicleId: string;
  providerUserId: string;
}

export type VehicleCommandInput =
  | { command: Exclude<VehicleCommandKind, 'set_destination'> }
  | { command: 'set_destination'; destination: { lat: number; lng: number } };

/** A webhook delivery, after the signature has been checked. */
export type VehicleWebhookEvent =
  | { kind: 'verify'; challenge: string }
  | { kind: 'state'; eventId: string; sequence?: number; providerVehicleId: string; providerUserId: string; state: VehicleState }
  | { kind: 'ignored'; eventId?: string; reason: string };

export interface Vehicles {
  listConnections(): Promise<IntegrationResult<{ connections: VehicleConnection[] }>>;
  readState(ref: VehicleRef): Promise<IntegrationResult<{ state: VehicleState }>>;
  /** Resolves when the provider reports the command's final result (it may hold the request open a while). */
  command(ref: VehicleRef, input: VehicleCommandInput): Promise<IntegrationResult<{ status: 'succeeded' }>>;
  webhook: {
    /** Constant-time check of the delivery's signature over the exact raw body. False when unsigned or not configured. */
    verify(rawBody: string, headers: Headers): Promise<boolean>;
    /** The body to answer a VERIFY challenge with, or null when the provider isn't configured. */
    answerChallenge(challenge: string): Promise<Record<string, string> | null>;
    parse(json: unknown): VehicleWebhookEvent;
  };
}
