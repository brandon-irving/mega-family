// Connected cars (Smartcar). The provider sits behind the Vehicles port (convex/ports/vehicles.ts); only
// convex/adapters/smartcar.ts knows Smartcar's URLs and JSON. Everything tunable lives here. Provider facts are
// from Smartcar's current docs (Oct 31, 2026): API Authentication (OAuth2 client credentials at
// iam.smartcar.com/oauth2/token, 1-hour token, no refresh token), Vehicle API v3 (`/connections`,
// `/vehicles/{id}/signals` with the `sc-user-id` header, `/vehicles/{id}/commands/...`), and webhooks (an
// HMAC-SHA256 `SC-Signature` over the raw body, keyed by the Application Management Token).

/** Who may link a car, read one that is shared with the household, and ask MEGA to act on it. Kids (teens
 * included) never see a car: its location is the driver's location. */
export const VEHICLE_ROLES = ['admin', 'adult'] as const;

export const VEHICLE_SHARING = ['private', 'household'] as const;

/** Commands MEGA can ask to run. Every one waits for the requester to tap Approve in their own chat. */
export const VEHICLE_COMMANDS = ['lock', 'unlock', 'set_destination'] as const;

export const VEHICLE_COMMAND_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'declined', 'expired'] as const;

/** Proactive vehicle alerts. Each fires on the transition into the state, once per vehicle per local day. */
export const VEHICLE_ALERTS = ['lowFuel', 'lowBattery', 'lowTire', 'lowOil', 'unlockedAtNight'] as const;

export const VEHICLES = {
  provider: 'smartcar' as const,
  env: {
    clientId: 'SMART_CAR_API_CLIENT_ID',
    clientSecret: 'SMART_CAR_API_SECRET',
    managementToken: 'SMART_CAR_APPLICATION_MANAGEMENT_KEY',
    /** Optional: the Smartcar application id (a UUID, Dashboard → Configuration), for Connect links. */
    applicationId: 'SMART_CAR_APPLICATION_ID',
  },
  api: {
    tokenUrl: 'https://iam.smartcar.com/oauth2/token',
    /** Connect with `response_type=none` + `external_id` (we use application tokens, so no code exchange). */
    connectUrl: 'https://connect.smartcar.com/oauth/authorize',
    vehicleBase: 'https://vehicle.api.smartcar.com/v3',
    /** Re-request the app token this long before Smartcar's stated expiry. */
    tokenRefreshMarginSeconds: 120,
    timeoutMs: 15_000,
    /** Smartcar holds a slow command open with a 202 for up to ~175 s before the final body (commands overview). */
    commandTimeoutMs: 190_000,
    connectionsPageSize: 50,
    /** Connections pages read at most (50 each) when looking for unlinked cars. */
    maxConnectionPages: 4,
  },
  /** One Smartcar application serves every family, and its token lists every connected car. A car is claimable
   * only by the member whose Connect `external_id` it carries. A simulated car with no `external_id` (made in the
   * Dashboard) is claimable by any adult only while this is on: fine for the demo, off for real multi-family use. */
  allowUnclaimedSimulated: true,
  webhookPath: '/smartcar/webhook',
  mcpPath: '/mcp/mega-vehicle',
  mcpVersion: '2025-11-25',
  /** The signals MEGA reads, by Smartcar code. Units come back with each value and are converted in the adapter. */
  signals: {
    fuelPct: 'internalcombustionengine-fuellevel',
    fuelRange: 'internalcombustionengine-range',
    oilLifePct: 'internalcombustionengine-oillife',
    batteryPct: 'tractionbattery-stateofcharge',
    batteryRange: 'tractionbattery-range',
    isCharging: 'charge-ischarging',
    odometer: 'odometer-traveleddistance',
    tires: 'wheel-tires',
    isLocked: 'closure-islocked',
    location: 'location-preciselocation',
  },
  /** A stored reading newer than this is good enough for the agent tool; older ones are refreshed first. */
  freshForMinutes: 5,
  limits: { nicknameMaxLength: 30, perFamily: 6 },
  alerts: {
    lowFuelPct: 15,
    lowBatteryPct: 20,
    /** Below this a tire is flagged. Typical passenger-car placards are 30–35 psi. */
    lowTirePsi: 28,
    lowOilPct: 15,
    /** "Unlocked at night" means the family's local hour is at or after `fromHour` or before `toHour`. */
    night: { fromHour: 21, toHour: 6 },
  },
  /** A saved family place counts as where the car is when it's within this distance. */
  atPlaceMiles: 0.25,
  /** Beyond this from every saved place, readers see "not near a saved place" instead of a far-off distance. */
  nearPlaceMaxMiles: 30,
  /** Smartcar's Vehicle Simulator labels tire pressures `kPa` but sends psi numbers (32, 35; probed Oct 31). Real
   * cars send real kPa (~220), so this applies to simulated cars only. */
  simulatedTiresArePsi: true,
  /** An approval left unanswered this long can no longer run. */
  commandApprovalMinutes: 30,
} as const;

export const VEHICLE_COPY = {
  notConfigured: "Car features aren't set up on this MEGA yet.",
  noCar: "No car is connected to MEGA yet. A grown-up can link one in Settings.",
  unavailable: "I couldn't reach the car right now. Try again in a minute.",
  approvePrompt: (action: string, car: string) => `${action} — ${car}. Approve?`,
  approve: 'Approve',
  cancel: 'Cancel',
  expired: 'That request expired. Ask me again if you still want it.',
  declined: "Okay, I won't do that.",
  running: (action: string) => `${action}…`,
  succeeded: (action: string) => `Done: ${action}.`,
  failed: (action: string, why: string) => `I couldn't ${action.toLowerCase()}: ${why}.`,
  alerts: {
    lowFuel: { title: 'Low fuel', text: (car: string, pct: number, range?: number) => `${car} is at ${pct}% fuel${range !== undefined ? ` (about ${range} miles left)` : ''}.` },
    lowBattery: { title: 'Low battery', text: (car: string, pct: number, range?: number) => `${car} is at ${pct}% charge${range !== undefined ? ` (about ${range} miles left)` : ''}.` },
    lowTire: { title: 'Low tire pressure', text: (car: string, which: string, psi: number) => `${car}: ${which} tire is at ${psi} psi.` },
    lowOil: { title: 'Oil change due', text: (car: string, pct: number) => `${car}'s oil life is down to ${pct}%.` },
    unlockedAtNight: { title: 'Car unlocked', text: (car: string, where: string) => `${car} is unlocked${where ? ` ${where}` : ''}. Want me to lock it?` },
  },
} as const;

export const vehicleAlertDedupeKey = (vehicleId: string, alert: string, recipientId: string, localDate: string): string => `vehicleAlert:${vehicleId}:${alert}:${recipientId}:${localDate}`;
