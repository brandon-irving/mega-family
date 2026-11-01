// Connected cars: the normalized shapes stored and returned (CONTRACT addendum "vehicles", pending approval).
// Provider-neutral: US units (miles, psi), percentages 0–100, epoch ms. A field is omitted when the car doesn't
// report it; it is never guessed.
import { type Infer, v } from 'convex/values';
import { VEHICLE_ALERTS, VEHICLE_COMMAND_STATUSES, VEHICLE_COMMANDS, VEHICLE_SHARING } from '../config/vehicles';
import { literals } from './validators';

export const vehicleSharing = literals(VEHICLE_SHARING);
export const vehicleCommandKind = literals(VEHICLE_COMMANDS);
export const vehicleCommandStatus = literals(VEHICLE_COMMAND_STATUSES);
export const vehicleAlertKind = literals(VEHICLE_ALERTS);
export const vehicleMode = v.union(v.literal('live'), v.literal('simulated'));

export const tirePressures = v.object({
  frontLeft: v.optional(v.number()),
  frontRight: v.optional(v.number()),
  rearLeft: v.optional(v.number()),
  rearRight: v.optional(v.number()),
});

export const vehicleState = v.object({
  fuelPct: v.optional(v.number()),
  batteryPct: v.optional(v.number()),
  rangeMiles: v.optional(v.number()),
  odometerMiles: v.optional(v.number()),
  oilLifePct: v.optional(v.number()),
  tiresPsi: v.optional(tirePressures),
  isLocked: v.optional(v.boolean()),
  isCharging: v.optional(v.boolean()),
  location: v.optional(v.object({ lat: v.number(), lng: v.number() })),
  /** When the provider read these values (real time). */
  readAt: v.number(),
});
export type VehicleState = Infer<typeof vehicleState>;
export type TirePressures = Infer<typeof tirePressures>;
export type VehicleCommandKind = Infer<typeof vehicleCommandKind>;
export type VehicleAlertKind = Infer<typeof vehicleAlertKind>;

/** What a reader sees. `where` is the nearest saved family place ("at Home"), never raw coordinates. */
export const vehicleView = v.object({
  id: v.id('vehicles'),
  nickname: v.string(),
  make: v.string(),
  model: v.string(),
  year: v.optional(v.number()),
  powertrain: v.optional(v.string()),
  mode: vehicleMode,
  sharing: vehicleSharing,
  ownerId: v.id('members'),
  isOwner: v.boolean(),
  state: v.optional(v.object({
    fuelPct: v.optional(v.number()),
    batteryPct: v.optional(v.number()),
    rangeMiles: v.optional(v.number()),
    odometerMiles: v.optional(v.number()),
    oilLifePct: v.optional(v.number()),
    tiresPsi: v.optional(tirePressures),
    isLocked: v.optional(v.boolean()),
    isCharging: v.optional(v.boolean()),
    where: v.optional(v.string()),
    readAt: v.number(),
  })),
});

export const availableVehicle = v.object({
  providerVehicleId: v.string(),
  make: v.string(),
  model: v.string(),
  year: v.optional(v.number()),
  mode: vehicleMode,
  powertrain: v.optional(v.string()),
});
