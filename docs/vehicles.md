# Connected cars (Smartcar) — backend

Owner request, Oct 31: Smartcar as a custom MEGA integration, backend only. CONTRACT v0.21 (pending approval).

## What it does

- **Link a car.** `vehicles.available` lists cars connected to MEGA's Smartcar application that no family has linked; `vehicles.link` claims one for the signed-in adult and reads it once. A car is **private** to the adult who linked it unless they set `sharing: 'household'` (then the family's adults see it). Kids, teens included, never see a car: its location is the driver's location.
- **Read it.** Fuel or battery, range (miles), locked or not, tire pressures (psi), oil life, odometer, charging. Readers get the nearest saved family place ("at Home", "2.4 mi from School"), never coordinates.
- **Act on it, with approval.** Lock, unlock, or send a saved place to the car's navigation. A request (agent tool, `vehicles.requestCommand`, or MCP) only posts an **Approve / Cancel** block in the requester's own chat. `chat.answerBlock` runs it on Approve, reports back, and re-reads the car. Unanswered requests expire after 30 minutes.
- **Proactive alerts.** Low fuel (≤15%), low battery (≤20%, not charging), a tire under 28 psi, oil life ≤15%, and unlocked at night (9 PM–6 AM, family time). Each alerts once when it starts, as a push to the owner through the normal pipeline. Unlocked-at-night also posts a ready **Lock** approval.
- **Agent tools.** `vehicle_status` and `vehicle_command` (adults). `vehicle_command` is blocked after an untrusted web result in the same turn, like every write.
- **MCP.** `POST /mcp/mega-vehicle` serves `vehicle_list`, `vehicle_status` and `vehicle_command` (request only) to any MCP client signed in with the app's bearer session. Same transport rules as `/mcp/mega-creation`.
- **Webhook.** `POST /smartcar/webhook` checks `SC-Signature` (an HMAC-SHA256 of the raw body keyed by the Application Management Token) before reading anything. It answers the `VERIFY` challenge and merges `VEHICLE_STATE` signals into the linked car; out-of-order (`meta.sequence`) and repeated (`eventId`) deliveries change nothing. A delivery through a different Smartcar user than the one the car was linked through is dropped.

All thresholds, copy and signal codes are in `shared/config/vehicles.ts`. Only `convex/adapters/smartcar.ts` knows Smartcar's URLs and JSON (port: `convex/ports/vehicles.ts`; fake: `convex/adapters/fakeVehicles.ts`).

## Setup

1. Secrets (already in `.env.secrets`): `SMART_CAR_API_CLIENT_ID`, `SMART_CAR_API_SECRET`, `SMART_CAR_APPLICATION_MANAGEMENT_KEY`.
2. Smartcar Dashboard → **Simulator** → create a vehicle (a gas car tells the fuel story). Grant all permissions. Set its state with **Publish**.
3. Prove the integration: `npm run live:smartcar` (token, connections, signals, link, agent tool, an approved lock on a *simulated* car, webhook VERIFY and signed and forged deliveries; no deployment needed).
4. To use it on the dev deployment (not done yet, because it changes the deployment the demo runs on): `node scripts/secrets.mjs sync-convex`, deploy, then in the Smartcar Dashboard create a webhook to `https://colorless-ibis-289.convex.site/smartcar/webhook` with triggers on tires, fuel, battery, oil, lock and location. Then subscribe the simulated car to it on the Simulator screen; simulated cars aren't auto-subscribed.
5. The deployment needs `MEGA_MODEL_ADAPTER=real` to use Smartcar (the same flag as the other real adapters).

## Not built yet

- The app UI (Settings → Connect a car, a vehicle card). Backend only, by request.
- Smartcar Connect for real cars (`response_type=none` with an `external_id` nonce, so a live car links to the member who connected it). Today `vehicles.available` lists every unlinked connection, which is right for simulated cars and a single-family app, but a multi-family app needs Connect.
- `travel_time` from the car's own location.
