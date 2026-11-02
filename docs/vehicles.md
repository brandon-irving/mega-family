# Connected cars (Smartcar) — backend

Integrated from `smartcar-vehicle` into `main` on November 2 at the owner's request. CONTRACT v0.22. This is the backend foundation for **shared assets**, with connected cars as the first asset type. The shared-assets UI and Demo Console scenario are not implemented by this merge.

## What it does

- **Link a car.** `vehicles.connectUrl` creates a Smartcar Connect URL tagged to the signed-in adult. `vehicles.available` lists unlinked cars carrying that adult's tag, plus untagged simulated cars while the demo configuration permits them. `vehicles.link` claims an eligible car and reads it once. A car is **private** to the adult who linked it unless they explicitly set `sharing: 'household'` (then the family's adults see it). Kids, teens included, never see a car: its location is the driver's location.
- **Read it.** Fuel or battery, range (miles), locked or not, tire pressures (psi), oil life, odometer, charging. Readers get the nearest saved family place ("at Home", "2.4 mi from School"), never coordinates.
- **Act on it, with approval.** Lock, unlock, or send a saved place to the car's navigation. A request (agent tool, `vehicles.requestCommand`, or MCP) only posts an **Approve / Cancel** block in the requester's own chat. `chat.answerBlock` runs it on Approve, reports back, and re-reads the car. Unanswered requests expire after 30 minutes.
- **Proactive alerts.** Low fuel (≤15%), low battery (≤20%, not charging), a tire under 28 psi, oil life ≤15%, and unlocked at night (9 PM–6 AM, family time). Each alerts once when it starts, as a push to the owner through the normal pipeline. Unlocked-at-night also posts a ready **Lock** approval.
- **Agent tools.** `vehicle_status` and `vehicle_command` (adults). `vehicle_command` is blocked after an untrusted web result in the same turn, like every write.
- **MCP.** `POST /mcp/mega-vehicle` serves `vehicle_list`, `vehicle_status` and `vehicle_command` (request only) to any MCP client signed in with the app's bearer session. Same transport rules as `/mcp/mega-creation`.
- **Webhook.** `POST /smartcar/webhook` checks `SC-Signature` (an HMAC-SHA256 of the raw body keyed by the Application Management Token) before reading anything. It answers the `VERIFY` challenge and merges `VEHICLE_STATE` signals into the linked car; out-of-order (`meta.sequence`) and repeated (`eventId`) deliveries change nothing. A delivery through a different Smartcar user than the one the car was linked through is dropped.

All thresholds, copy and signal codes are in `shared/config/vehicles.ts`. Only `convex/adapters/smartcar.ts` knows Smartcar's URLs and JSON (port: `convex/ports/vehicles.ts`; fake: `convex/adapters/fakeVehicles.ts`).

## Setup

1. Required secrets: `SMART_CAR_API_CLIENT_ID`, `SMART_CAR_API_SECRET`, `SMART_CAR_APPLICATION_MANAGEMENT_KEY`. Connect URLs also require `SMART_CAR_APPLICATION_ID`. Verify their presence through the secrets helper; never put them in client configuration.
2. Smartcar Dashboard → **Simulator** → create a vehicle (a gas car tells the fuel story). Grant all permissions. Set its state with **Publish**.
3. Prove the integration: `npm run live:smartcar` (token, connections, signals, link, agent tool, an approved lock on a *simulated* car, webhook VERIFY and signed and forged deliveries; no deployment needed).
4. Before a live rehearsal, sync the required secrets to the intended development deployment and deploy the merged backend. In the Smartcar Dashboard create a webhook to `https://colorless-ibis-289.convex.site/smartcar/webhook` with triggers on tires, fuel, battery, oil, lock and location. Subscribe the simulated car to it on the Simulator screen; simulated cars aren't auto-subscribed. A Git merge alone does not configure these external resources.
5. The deployment needs `MEGA_MODEL_ADAPTER=real` to use Smartcar (the same flag as the other real adapters).

## Not built yet

- The app UI (Settings → Connect a car, a vehicle card). Backend only, by request.
- The frontend Smartcar Connect/return/link flow. The backend URL and member ownership checks exist; `vehicles.available` does **not** expose every family's connections. Disable `VEHICLES.allowUnclaimedSimulated` outside controlled rehearsals.
- `travel_time` from the car's own location.

## Shared-assets demo extension

Keep the current [Demo Console flow](demo-console.md) as the baseline. The next implementation should expose this backend through shared controls rather than introduce a second demo service:

1. An adult connects a simulated car and explicitly chooses to share it with the household's adults. Family membership or Google availability sharing must not silently share vehicle data.
2. The console triggers a clearly labeled simulated low-fuel or tire-pressure change. Today alerts go to the car's owner only; routing an alert to another adult needs an explicit asset responsibility setting and permission checks.
3. The responsible adult's MEGA explains the reading alongside an upcoming family commitment. Only use actual permitted calendar context; knowing about a pickup does not reveal a teen's private data or grant the teen access to vehicle location.
4. If the adult requests a supported car command, show the existing approval block. Report completion only after Smartcar responds.
5. Add run-scoped scenario state and reset behavior before presenting this as repeatable. Current Restart story leaves vehicle links/readings alone; Restart full onboarding creates a new family and does not transfer car ownership. Google cleanup never changes vehicle state or disconnects a car.

The generic asset catalog, responsibility routing, connection UI, and simulator/reset controls remain follow-up work. This merge does not create a parallel `sharedAssets` table or pretend those capabilities already exist.
