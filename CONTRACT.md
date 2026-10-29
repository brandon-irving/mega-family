# MEGA — Frontend ↔ Backend Contract

**Status: v0.3, approved Oct 26.**

This is the agreement both build tracks follow. The backend owns `convex/`, the frontend owns `app/` + `src/`, and this contract (which becomes `shared/`) is owned by both.

## Changelog
| Version | Date | Change |
|---|---|---|
| 0.18a | Oct 29 | **Pending approval.** G8 backend, additive. `widgets.next` is `real` (`convex/model/widgetTimeline.ts`). **Rules as built:** events are what the viewer sees in the app (`canSeeEvent`), never another member's private-layer event even with the viewer in `who`; a **kid** additionally sees only events they're in or the whole family's (`who` empty), so a household event for other people (an adult's dinner, a pickup) stays off a kid's widget. Items are sorted by start (then title), `maxSoon` per entry; a new entry only when what the widget shows changes (enter at `start − soonWindowMinutes`, leave at `start + startedGraceMinutes`); identical neighbours are merged. `statement.short` = whole words up to `shortStatementChars`, trailing punctuation dropped, then "…". The plan ends with one `stale` entry at the horizon, or at the first change it had to drop when `maxEntries − 1` entries were used; a plan with nothing planned and nothing to say is a single `empty` entry. `stale` and `empty` carry no text (the app fills `G8_COPY`). No model calls, no new tables. |
| 0.18 | Oct 29 | **Pending approval.** G8 contract, all additive. **§4:** `widgets.next` (q, any member, own data only) → `WidgetTimeline` (§6): the home/lock widget timeline the app writes into the `MegaNext` / `MegaTalk` kinds with expo-widgets `updateTimeline` (iOS). `widgets.timeline` (G3) stays for the Today screen and is unchanged. **§6:** `WidgetTimeline` = `{ generatedAt, mega, kid, entries: WidgetNextEntry[], talkLink }`; `WidgetNextEntry` = `{ at, kind: "soon" \| "statement" \| "empty" \| "stale", soon?: WidgetSoonItem[] (≤ WIDGET_TIMELINE.maxSoon), statement?: { text, short }, link }`; `WidgetSoonItem` = `{ title, startsAt, timeLabel, who: { name, hex }[], private }`. The widget computes "in 40 min" from `startsAt` and its entry date (the widget runtime can't fetch or read app state). `private` marks the viewer's own private-layer events; the lock screen shows `G8_COPY.widgetPrivate` with SwiftUI `privacySensitive` instead of the title. The last entry after `WIDGET_TIMELINE.horizonHours` is `stale` ("Open Teal for what's next"), because the frozen build has no background-refresh module: widgets refresh only while the app runs. Widget taps use the existing §6 links (`widgetURL`): `soon`/`empty`/`stale` → `mega://today`, `statement` → `mega://chat`, Talk → `mega://talk`. **No new functions** for the QR scan (it feeds the existing `invites.preview` / `invites.redeem` through `mega://join/<token>`), the homework viewfinder (`files.uploadUrl` → `homework.submit`, unchanged) or Paste (client only). **Config:** `WIDGET_TIMELINE` (shared/config/widgets.ts), `INVITE_SCAN` (auth.ts: only `mega://join/<48 hex>` or the bare token; anything else is refused and never opened), `HOMEWORK.capture` (quality, `exif: false`), `G8_COPY`. **Gaps (frozen native build):** no `accessoryInline` family (the Widgets board's inline line can't ship until a rebuild), no background widget refresh, Android widgets off. |
| 0.17b | Oct 29 | **Pending approval.** G5 review fixes, all additive. **§2:** `integrations.syncingUntil?` (server-only sync lease, real time, `INTEGRATION_SYNC.leaseSeconds`: one sync per integration at a time; a sync that finds it held does nothing); `messages.ruleBlock?: "onboarding" \| "profiler"` (a block answered by rule — a repeat or stale answer to one is a no-op: no second answer bubble, no agent reply, `streamId` absent); `profilerRuns.status?: "running"` (the sweep's claim before it schedules a run). **§3:** the `reconnect` card gains `integrationIds?` — one card per lapse listing every integration on that Google grant (Gmail + Calendar), `integrationId` is the first. **§4 new:** `invites.forMember({ memberId })` (q, admin or that member's parent) → `{ status: 'none' } \| { status: 'joined' } \| { status: 'pending', expiresAt, invitedByName } \| { status: 'expired', expiresAt }` — the link itself can't be read back (only its hash is stored), so "Show invite" calls `invites.create` for a fresh one; `kidControls.mine()` (q) → a kid's own rules read-only (`KidControls` fields + `dailyCap`, their buzzes a day), `null` for adults; `kidControls.setDailyCap({ memberId, dailyCap })` (m, the kid's parents) sets the kid's `settings.notify.dailyCap` within `LIMITS.push.kidDailyCapRange` (VALIDATION outside it); **reconcile (G5 frontend):** `kidControls.mine` also returns `parents: string[]` (their parents' names, for "Set by …"), and `kidControls.dailyCap({ memberId })` (q, the kid's parents) → `{ dailyCap }` for the Rules stepper. **§4 changed shapes:** `integrations.addIcs` returns `reason?: "unreachable" \| "not_a_calendar" \| "too_large" \| "refused"` with `failure` (a malformed or private-address link is still VALIDATION / `G5_COPY.icsBad`); `megas.activity` items gain `decidedBy?` (`rule:…`, `model:…`, or `member`; the event's own, else `ACTIVITY.decidedByDefault[type]`). **§4 behavior:** `onboarding.skip` is FORBIDDEN for kids; `chat.start` mid-family-step re-shows the CURRENT sub-step's block (rebuilt if the posted one is gone) instead of restarting at "who", and the family block counts as showing while it exists unanswered; at `ONBOARDING.maxFamilyMembers` the family step says so (`G5_COPY.familyFull`) and offers only "Done for now" (`familyDoneForNow`); a denied/failed combined Gmail + Calendar consent marks BOTH offers failed. **Integrations:** schedule links — every hop re-checked (https/webcal only; no IP literal in a private, loopback, link-local, ULA, CGNAT or multicast range, incl. decimal/hex/octal/IPv4-mapped forms; no `localhost`, `.local`, `.internal`, … — config `ICS.blocked*`), redirects followed by hand (`ICS.maxRedirects`), body read as a stream and dropped past `ICS.maxBytes`, one `ICS.timeoutMs` deadline for every hop and the body; Gmail history is read to its last page before its `historyId` is used (past `GMAIL.historyMaxPages` pages or the queue's room → full resync, never a half-read cursor); bodies decoded in their declared charset; the sender's display name is cleaned and sits inside the untrusted fence (and in `mailItems.sourceLabel`); Calendar paging runs to the page with `nextSyncToken` even past `maxEvents` (`GOOGLE_CALENDAR.maxPages`), and a pass without a new token keeps the old one; sync config writes merge. **§7:** `ICS.maxRedirects` / `blockedHostnames` / `blockedHostSuffixes` / `blockedIpv4` / `blockedIpv6`, `ICS_FAILURE_REASONS`, `GMAIL.historyMaxPages`, `GOOGLE_CALENDAR.maxPages`, `INTEGRATION_SYNC.leaseSeconds`, `LIMITS.push.kidDailyCapRange`, `ACTIVITY.decidedByDefault`, `G5_COPY.familyFull` / `familyDoneForNow`. **§8:** `ClockPort.realNow()` is also used for the sync lease (a process guard, never family-facing). **Last fixes (Oct 29):** `invites.create`'s `qrPayload` is now the full join link (same as `url`, `mega://join/<token>`), so a phone's own camera opens MEGA; `invites.preview` / `.redeem` accept the bare token or the full link (with a trailing slash, query or fragment), one rule in `shared/inviteToken.ts` (`inviteTokenFrom`) shared with the app's paste box and G8's scanner. `megas.activity` `decidedBy` is `member:<memberId>` when the event's `payload.actorId` is a member of the viewer's family, else a bare `member` (the app shows "A family member"); `ACTIVITY.member` names the prefix. The learning event records `actorId`. |
| 0.17a | Oct 29 | **Pending approval.** G5 backend addendum, all additive. **Built:** every v0.17 function is `real`; the real `GoogleOAuth` (web-server flow, refresh, revoke), `MailSource` (Gmail history/messages, 404 → full sync), `CalendarSource` (events.list, 410 → full sync) and `IcsFetcher` (https/webcal, conditional GET) adapters replace the placeholders (`unconfiguredIntegrations.ts` and `convex/model/g5Stub.ts` deleted); Google stays `not_configured` until GOOGLE_* **and** `INTEGRATION_TOKEN_KEY` are set. **§2:** `onboarding` gains optional `family { step, role?, name?, relationship? }` (the family step's sub-step), `blockMessageId?` (the block waiting for an answer) and `failures { gmail?, calendar?, ics? }` (last failed connect per offer → `integrations.offer` `failed`); `profiles.checkQuestions[]` gains optional `messageId` (the posted check question). **§4 behavior:** integrations are **adults only** (`googleStart`, `googleConnectCode`, `connectDevice`, `addIcs` → FORBIDDEN for kids); `onboarding.skip` outside onboarding records the skipped offer in a finished (`done`) onboarding row, so `onboarding.state` for that member is `{ step: 'done', … }` instead of null; `chat.answerBlock` on an onboarding family block or a profiler check question is answered by rule (no agent reply, `streamId` absent); a connect never posts a separate "connected" text line (the `connect` card's live `offer` state shows it); Gmail's onboarding step moves on after the first look at the inbox finishes (found card or "nothing needs you"), so the found card comes before the calendar card. The family step follows the Onboard board's admin turns: who (kid / someone else / just me) → name (`text`) → relationship (`choice`) → get a MEGA? (`choice`) → details (`fields`: birthday, grade/work, activities) → look → invite + "Add someone else / That's everyone". **§7 config:** `GMAIL.reminderAt` / `maxAheadDays` / `seenMemory` / `pendingMax`, `INTEGRATION_SYNC` (`syncNowMinSeconds`, `stateCleanupMinutes`), `ONBOARDING.maxFamilyMembers`, `DEVICE_CALENDAR.maxCalendars`, `PROFILER.sweepMinutes`; `G5_COPY` family-step lines from the board (`relationshipLabels`, `personDetails*`, `personLook*`, `personInvite`, `personNoMega`, `familyAllSet`, `nameAgain`, `checkAck`). **§8:** `ClockPort.realNow()` — real time for provider-set expiries only (Google access tokens, the OAuth state TTL), never family-facing time. **Internal:** crons `gmail poll`, `google calendar poll`, `schedule link poll` (only rows with a stored grant / link), `oauth state cleanup`, `nightly profiler sweep`; `chat.streamFixedText` (streams onboarding's fixed "Nice to meet you" reply). **Evals:** `evals/mailExtract` (15 synthetic emails, 100% on the first run, 4.75¢). |
| 0.17 | Oct 29 | **Pending approval.** G5 (owner, Oct 28: sign up → the chat asks your name → integrations one at a time, Gmail first → family steps; Settings; HQ; profiler), all additive except where noted. **§1 ids (config):** `INTEGRATION_FAILURES` gains `unauthorized` (a lapsed/revoked Google grant); new `INTEGRATION_KINDS` (adds `gmail`, `googleCalendar` to the G1 kinds), `INTEGRATION_STATUSES`, `ONBOARDING_STEPS`, `ONBOARDING_OUTCOMES`, `MAIL_ITEM_KINDS`, `MAIL_ITEM_STATUSES`, `CONNECT_OFFERS`, `GOOGLE_PRODUCTS`. **§2:** `events.source` gains `gmail` and `google`, `events.integrationId?`; `integrations` gains optional `status`, `label`, `host`, `lastFailure`, `lastFailureAt`, `connectedAt`, `disconnectedAt` and its `kind` takes the new kinds (old rows stay valid); new tables `integrationSecrets` (server-only, encrypted Google grants), `oauthStates`, `mailItems`, `onboarding`, `profilerRuns`. **§3 cards:** `connect { offer }`, `mailFound { integrationId, itemIds }`, `reconnect { integrationId }`. **§4:** `onboarding.begin` / `.state` / `.setName` / `.skip`; `family.add`; `integrations.list` / `.offer` / `.googleStart` / `.googleConnectCode` / `.connectDevice` / `.syncDevice` / `.addIcs` / `.disconnect` / `.syncNow`; `mail.items` / `.dismiss` (all stubs until the G5 backend); HTTP `GET /google/oauth/callback`. `onboarding.start` stays (tests, demo) but the app stops calling it. **Behavior:** while the caller's onboarding step is `name`, `chat.send`'s text is their name; `chat.start` for an admin mid-onboarding re-posts the current step's card instead of the adult greeting; the onboarding family step's blocks are answered with `chat.answerBlock`. **§7:** `google` (`GOOGLE`, `GMAIL`, `GOOGLE_CALENDAR`), `onboarding` (`ONBOARDING`, `ICS`, `DEVICE_CALENDAR`, `PROFILER`), `G5_COPY`. **§8 ports:** `GoogleOAuth`, `MailSource`, `CalendarSource`, `IcsFetcher` (ICS parsing is ours, no package). **Seed:** Admin's finished onboarding, a display-only Gmail (no grant) with one found item ("Picture day", private), a team schedule link. |
| 0.16b | Oct 28 | **Pending approval.** G4b review fixes, all additive. **§3:** the `products` card gains optional `title` (a short heading the MEGA writes through `shop_search`'s new optional `title` arg, trimmed to `SHOPPING.titleMax`; absent → the app shows the query). **§3 behavior:** the `weather` card a chat `weather` tool call posts now carries `air: { usAqi?, uvIndexMax? }` (today's AQI and peak UV; `uvAt` stays tip-only), and the sentence the MEGA is given (and the card `summary`) names the AQI and peak UV with their level words (`G4B_COPY.sentenceAqi` / `sentenceUv`); no air data → no air words. **§7:** `SHOPPING.currency` ("USD"), `SHOPPING.titleMax`, `levelOf(bands, value)` (shared/config/integrations.ts; the one AQI/UV band lookup for the app and the backend), `G4B_COPY.sentenceAqi` / `sentenceUv`. **§8:** `ProductSearchRequest` / `ProductLookupRequest` gain required `currency`; the Shopify adapter sends `context.currency` and drops (search) or returns in `notFound` (lookup) any product priced in another currency, never converting it (live: a Canadian store's CA$ jacket reached a US search). |
| 0.16a | Oct 28 | **Pending approval.** G4b backend addendum, all additive. **Built:** every v0.16 function is `real`; the real `ProductCatalog` (Shopify Global Catalog, keyless; `not_configured` without the deployment's site URL) and `Holidays` (Nager.Date) adapters replace the placeholders, and the Weather adapter adds Open-Meteo air quality (an air failure only leaves `air` out). **Served:** our UCP platform profile at `GET <CONVEX_SITE_URL>/ucp/agent-profile.json` declaring `dev.ucp.shopping.catalog.search`, `.lookup` and Shopify's `dev.shopify.catalog.global` extension (needed for the enriched fields; no cart/checkout/order); Shopify negotiated exactly those three live on Oct 28. **§2 behavior:** a paused holiday puts a step `{ id: HOLIDAYS.bedtimeNoteStepId ("holiday"), label: G4B_COPY.bedtimeNoRoutine }` first in the kid's bedtime run the night before (the app shows it as the "No school tomorrow" note). **§3 behavior:** a UV / air tip posts a `weather` card with `tip`, `eventId`, `placeLabel` and `air: { usAqi, uvIndexMax, uvAt }` (rain tips keep the G4 notification card). **§7:** `WEATHER.airTipPushMinAqi` (151: an air tip at "Unhealthy" or worse pushes; other air tips and every UV tip are quiet statements), `HOLIDAYS.bedtimeNoteStepId`, `formatPriceCents` / `maxPriceCentsOf` (shared/config/shopping.ts), dedupe keys `weatherTipDedupeKey`, `priceDropDedupeKey`, `holidayDedupeKey`. **Internal only:** gift ideas try the catalog first and use G4's web-search link only when the catalog has nothing; `seed.resetDemo` (real mode) swaps the sample product ref and watch for live catalog results and refreshes holidays; `seed.demoStagePriceDrop({ percent? })` (DEMO_MODE-gated) stages a drop for demos by raising watch baselines above the live price (its "was" price is staged; resetDemo restores real baselines); the per-family tick fires card candidates its scans just queued in the same tick (a demo `clock.jump` shows the holiday question at once instead of on the next 5-minute sweep); crons `price watch checks` (every `SHOPPING.priceCheckHours`) and `holiday cache refresh` (every `HOLIDAYS.refreshDays`), and the GD tick refreshes a missing or expired holiday year. The optional Shopify Dev Dashboard token isn't wired (keyless access works; it only raises rate limits). |
| 0.16 | Oct 28 | **Pending approval.** G4b (owner, Oct 28: shopping, air quality and UV, holidays before G5), all additive. **§2:** `families.country?` (holidays; `HOLIDAYS.defaultCountry` when empty), `places.outdoor?`, `giftIdeas.ideas[].productRefs?`; new tables `priceWatches`, `routineSkips`, `holidays`. **§3:** cards `products` (refs only), `priceDrop`, `holiday`; the `weather` card gains `air?` and `tip?: "rain" \| "uv" \| "air"`. **§4:** new `shopping.products` (a), `shopping.watches` / `.watch` (q), `shopping.unwatch` (m), `holidays.upcoming` / `.question` (q), `holidays.answer` (m), all stubs until the G4b backend; `places.upsert` takes `outdoor?`; `WeatherView` gains `air?`. **§5:** button sets `holiday.default` (`pause` / `keep`) and `price.default` (`stop_watching`). **§7:** `shared/config/shopping.ts` (`SHOPPING`, `HOLIDAYS`), `WEATHER.air` / `uvTipMin` / `aqiTipMin`, `AQI_LEVELS`, `UV_LEVELS`, `GIFTS.productsPerIdea` / `priceSlackPct`, `G4B_COPY`, roles tool `shop_search` (adults). **§8:** ports `ProductCatalog`, `Holidays`; `WeatherForecast` gains `air?`. **Internal only:** candidate sources `priceDrop`, `holiday`, and `weatherEvent.tip?`; agent tool `shop_search` (registered, not implemented). **Provider rule that shaped this:** Shopify's catalog terms forbid caching search results and images, so we store only product refs (plus the price watch's own observations of an item a member chose to keep) and the app reads current details live through `shopping.products`. |
| 0.15a | Oct 28 | **Pending approval.** G4 backend addendum, all additive. **Built:** every v0.15 function is `real`; the real `WebSearch` (Meta Responses API `web_search`, `include: ["web_search_call.results"]`), `Weather` (Open-Meteo + NWS), `Directions` and `Geocoder` (Mapbox; `not_configured` without MAPBOX_TOKEN) adapters replace the placeholders. **§4 (G4 frontend requests):** `travel.answer({ travelCheckId, action })` → `{ message, remindAt }`; the leave-by push's On my way / Snooze 5 min use the same path. **§3 cards:** `travel` gains `eventTitle?`, `eventStart?`; `weather` gains `nowF?` (Open-Meteo `current`); `search` gains `parentsTold?` (a kid's blocked card). **§8:** `WeatherForecast` gains optional `current`. **Internal only:** `candidateSource` gains `searchNotice` (the quiet notice to a kid's parents about a blocked/rephrased search, always a statement); the agent loop routes `web_search` / `weather` / `travel_time` to `convex/agent/netTools.ts` and, once a search result is in a turn, refuses non-read-only tools for the rest of that turn (invariant 1); gift ideas get one product `url` each from web search. **Config:** `WEATHER.current`, `WEATHER.viewHours`, `WEATHER_CODES`, `TRAVEL.firstEstimateMinutes` / `snoozeMinutes` / `remindBeforeEventMinutes`, `GIFTS.productSearch`, `KID_SAFETY.search.blockedKeywords` (a starter list), G4 dedupe keys. **Seed:** soccer and school drop-off events link to their places; one past search per kid (Twin 2's blocked); Thursday's pickup has an honest `not_configured` travel check; no seeded forecast (`seed.resetDemo` fetches a real one). |
| 0.15 | Oct 28 | **Pending approval.** Gate G4: web search with the kid filter, weather + NWS alerts, travel time (brief: docs/gates/G4.md). All additive. **New tables (§2):** `places` (family places: home/school/work/custom — household data, every member reads, adults edit; coordinates from the new `Geocoder` port, never the phone), `weatherCache` (internal), `travelChecks` (leave-by results; visible only to members who can see the event), `searchLog` (every search and what the kid filter did, with `decidedBy`; the member reads their own, a kid's parents only that kid's blocked/rephrased rows and only when `tellsParents.blockedSearches` is on). **New optional fields:** `events.placeId`; `profiles.places` is superseded by `places` (kept, always `[]`). **Cards (§3):** `search` gains `outcome?`, `rephrasedTo?`, `searchLogId?`; `weather` gains `placeLabel?`, `hours?`, `highF?`, `lowF?`, `alert?`, `eventId?`; `travel` gains `eventId?`, `fromLabel?`, `typicalMinutes?`, `checkId?`, `failure?` (fail closed: no made-up times). **New functions (§4):** `places.list` / `.upsert` / `.remove`, `weather.get` / `.refresh`, `travel.forEvent`, `search.log`, all `stub` (real validators; empty results or `NOT_FOUND` "not built yet") until the G4 backend; `events.create` / `.update` take optional `placeId` (update: `null` clears). Search itself stays the agent's `web_search` tool (no public function). **Ports (§8):** `WebSearch`, `Weather`, `Directions`, `Geocoder`, each returning `{ ok: true, … } \| { ok: false, failure }` (`not_configured` when a secret such as MAPBOX_TOKEN is missing); fakes for tests, fail-closed placeholders in real mode until the G4 adapters land. **Config (§7):** `shared/config/integrations.ts` (`PLACES`, `GEOCODING`, `WEB_SEARCH`, `WEATHER`, `TRAVEL`, `INTEGRATION_COPY`), `KID_SAFETY.search`, `models.webSearch.model`/`api`, `PRICING.webSearch`, ids `PLACE_KINDS`, `ALERT_SEVERITIES`, `SEARCH_OUTCOMES`, `INTEGRATION_FAILURES`, `GEOCODE_STATUSES`. **Internal only:** `candidateSource` gains `leaveBy`, `weatherAlert`, `weatherEvent`. **Seed (§10):** four places at public Brooklyn landmarks (home, school, work, a soccer field). |
| 0.14a | Oct 28 | **Pending approval.** GD review fixes (all additive). **§4:** `chores.snooze({ choreId })` (m, the kid it's for, on today's still-due instance) → `{ remindAt }`: the chore card's "In 10 min", the same re-remind as the push's `snooze_10` (after `CHORES.snoozeMinutes`, through the normal quiet hours and caps); VALIDATION when nothing is due. **§2:** `routineRuns.steps[].source` gains `start?` (the household event's start, ms) so the bedtime card can say "…at 4:30"; `collisions.fingerprint?` (internal: both events' timing and people when detected; a dismissed or resolved clash is raised again only once this changes). **Behavior, no shape change:** the clash checker now also sees household events already in progress; an all-day event saved without `end` gets the end of its local day; a stale clash that recurs is raised again; `invites.redeem` refuses a second claim of one invite (INVALID_INVITE) even when two redeems race; the old cross-member "matters to" trigger is removed (no `familyEvents` row can push to another member). |
| 0.14 | Oct 28 | **Pending approval.** Screen 9 sign-in redesign (owner's Oct 28 walkthrough; canvas v33). All additive. **§2:** `invites.invitedBy?: Id<members>` (who sent it) and `invites.mega?: { name, look, personality }` (the MEGA the person gets on joining). **§4:** `invites.create` takes optional `mega` (the admin's choice; omitted → the member's existing MEGA, else the first preset color no family MEGA wears, named after it — config `INVITE_MEGA_DEFAULTS`). New query `invites.preview({ token })` — callable signed out (the token is the credential) — returns `{ status: 'invalid' }`, `{ status: 'expired' | 'locked', inviterName }` or `{ status: 'ok', kind: 'adult' | 'kid', inviterName, memberName, mega, family: [{ name, hex, sticker }] }` (joined members only); never ids, the parent code or the token hash. `invites.redeem` takes optional `mega`: an adult's change to the invite's MEGA (VALIDATION on an empty/long name or a non-hex color; **FORBIDDEN for a kid**, refused before the parent code is checked so it isn't counted as a wrong guess). Joining now always gives the member a MEGA (the adult's change, else the invite's, else the default) and sets `hasMega`; a member who already has one keeps that row (patched, never duplicated). **Auth:** Better Auth email + password is on (`requireEmailVerification: false`, 8–128 characters, config `AUTH.email`); password reset goes through a new `EmailSender` port whose only adapter logs (no provider yet — the app shows a "coming soon" placeholder). |
| 0.13b | Oct 28 | **Pending approval.** Owner's Oct 28 walkthrough: never an empty chat; MEGAs start the conversation. All additive. **§4:** `chat.start` (m, `{}` → `{ started: boolean }`): the app calls it on opening chat; once per thread it writes the MEGA's starter: a kid gets the KidsIntro board's hello, an `intro` card and a tip (config `KID_INTRO`, no model call); an adult gets a greeting their MEGA writes through the agent loop, then a choice block (`ADULT_STARTER`). MEGA cards already in the thread don't block it; a member who has already written something is never started over. **§2:** `threads.startedAt?` (when that first open was handled). **§3:** card kind `{ kind: "intro" }` (no id; its rows are config). Also, no shape change: `chat.answerBlock`'s `answer` message label is now what the member picked ("9:00 PM"), not the word "Answered" (one shared `summarizeAnswer` in `shared/domain/answerLabel.ts`). |
| 0.13a | Oct 28 | **Pending approval.** GD backend addendum (all additive, except one button swap noted last). **Built:** every v0.13 function is now `real` (no stubs); the privacy grid FAILS (no longer skips) a function the seed can't probe, and has zero skips. **§2:** `shareActions.item` also takes `{ kind: "memory", memoryId }` (a shared private memory needs the same record); `routineRuns.steps[].source` gains `title?` (the household event's title, so a bedtime card can say "Soccer tomorrow"). **§4, frontend requests:** `routines.run({ runId })` (the run's kid or their parents), `bucks.entry({ ledgerId })` (a kid: own rows only; adults: any kid's), `megas.family()` (Hub's badge, any member), and `ProposalView.clashEventIds` (both clashing household events). Proposal `before`/`after` already carry `who`. **§5:** `chore.default` is now `done` "Done" · `snooze_10` "In 10 min" (board KidsChore), replacing `later` "Later" — the frontend's category list must use the new id; snoozing re-reminds after `CHORES.snoozeMinutes` through the normal timing pipeline. **Internal only:** `candidateSource` gains `chore`, `routine`, `proposal`, `shareSuggestion`, `practice`, `gifts`, `bucks` (card-backed pushes: the thread gets the GD card, the push goes through the usual quiet hours/caps, no draft model call); `seed.sampleFamily` / `resetSampleFamily` take an optional `homeworkStorageId`, and `seed.resetDemo` (internal action) stores the synthetic worksheet and resets; `ChatModel` requests take `model?: "chat" \| "judge" \| "vision" \| "wording"` and user-message `images?` (§8); the writer's "matters to" no longer fires a cross-member push — for a private fact it becomes a share suggestion to the fact's owner. |
| 0.13 | Oct 28 | **Pending approval** (the private-event tightening is owner-approved, Oct 28: "private events arent shared without explicit consent first"). Gate GD (demo features; owner decisions Oct 26–27 in STATUS.md, boards Screens 9–12, brief docs/gates/GD.md). Additive except one tightening, noted last. **New tables (§2):** `shareActions`, `shareSuggestions` (layers and the explicit-share rule), `collisions`, `proposals` (clash fixes, Admin approves), `giftIdeas`, `homeworkSheets`, `practiceSets`, `practiceAttempts`, `chores`, `choreClaims`, `routines`, `routineRuns`, `bucksLedger`, `purchases`. **New optional fields:** `megas.look.antenna` / `.eyes` / `.eyeColor` (Store look parts; missing = `classic`), `events.ownerId` (owner of a private-layer event), `memories.gate` (`{ decidedBy, reason? }`, which rule or model decided `sensitive`), `notifications.choreId`. **New card kinds (§3):** `homework`, `practice`, `chore`, `routine`, `bucks`, `shareSuggestion`, `proposal`, `gifts` (each holds only an id; the app loads it with the matching query). **New functions (§4):** `events.share` / `.unshare`, `shareSuggestions.*`, `proposals.*`, `gifts.*`, `homework.*`, `practice.*`, `chores.*`, `routines.*`, `bucks.*`, `store.*`, all `stub` (registered with real validators; empty results or `NOT_FOUND` "not built yet") until the GD backend fills them in. **New config:** `shared/config/store.ts` (catalog, prices, free set, Mega Bucks defaults), `calendar.ts` (`LAYER_OF_SCOPE`, `CLASH`, `GIFTS`), `kids.ts` (`HOMEWORK`, `CHORES`, `ROUTINES`), `models.vision` / `models.wording` (Muse Wonder words the clash fix only), button set `chore.default` (§5), copy `PROPOSAL_DISCLOSURE` / `SHARE_RULE_COPY`. **Tightening (authorized by the owner's explicit-share rule, Oct 26):** a `personal` event is visible only to its owner (`ownerId`, else `createdBy`); being listed in `who` no longer reveals someone else's private event (`convex/model/visibility.ts` today lets `who` see it). Internal only: the backend adds its new candidate-source kinds with the code that uses them. The privacy grid now reports a function as **skipped** (not passed) while its id args point at a table the seed doesn't fill yet. |
| 0.12 | Oct 26 | **Pending approval.** G3 backend review fixes (security + correctness + UX; see STATUS.md for the full list). All additive, no breaking change to any public function's args/returns. Schema: `candidates.draft` gains `title?: string` (§2) — the draft+judge call's own sanitized headline for the notification (UX6: "Return the library book", never the MEGA's name), falling back to the trigger's own seed text when the model omits one; optional so a pre-existing/hand-seeded candidate with no title just falls back to the MEGA's name at delivery time, same as before. Ports (§8): `PushSender.send` now also returns each ok ticket's Expo Receipt `id` (`PushSendResult.id?`), and `PushSender` gains `getReceipts(ticketIds)` — Expo's delayed delivery-receipt check (C7); `PushMessage` gains `threadId?` (iOS push grouping, UX4, `aps.thread-id` via `shared/config/notifications.ts` `pushThreadIdFor` — quiet kinds group by MEGA, loud kinds don't; Android has no equivalent field in Expo's push API, a documented gap). §5 Push notifications: the push payload's `body` is now config-redacted to a generic "`<MEGA>` has a message for you" for a mattersTo-sourced tip/update (`shared/config/notifications.ts` `PUSH_BODY_REDACTION`) — the full text always stays in the thread (`notifications.get`), only the lock-screen copy changes; reminders/requests are never redacted. New config, no shape change: `shared/config/proactive.ts` `mattersToDailyCapPerFamily` (a per-family-per-day cap on cross-member "matters to" model calls) and `DRAFT_SANITIZE` (max length + per-kind emoji allowance, default off, for every draft+judge title/text); `shared/config/limits.ts` `LIMITS.push.receiptCheckDelayMinutes`. Internal-only plumbing (no public API change): `convex/proactive.ts` gains `checkPushReceipts` and `dropKidConcernCandidate`; a kid-targeted draft now runs through the same independent concern classifier a memory save does before being scheduled. |
| 0.11 | Oct 26 | **Pending approval.** Killed-app push answers: iOS's background notification-response task runs headless with no signed-in Better Auth session, so it can't call `notifications.answer`. Additive: push payload `data` gains `answerToken?: string` (§5) — an HMAC-SHA256 token (`convex/model/pushAnswerToken.ts`), scoped to one `(notificationId, recipientId)` pair, expiring with the notification (`LIMITS.push.answerTokenTtlDays`, 7 days default); nothing is persisted for it (it's self-contained — recomputing and `crypto.subtle.verify`-comparing the signature IS the check). New HTTP route `POST /push/answer` (`h`, convex/http.ts) — body `{ notificationId, buttonId, answerToken }`, returns `{ reply: string }` on success, a fixed generic `{ error }` (HTTP 400) on every failure (unknown notification, wrong/expired token, unknown button, locked out) so no response lets a caller tell those apart. Runs the exact same idempotent apply path `notifications.answer` does (`convex/model/notificationAnswer.ts`) — an already-answered notification just returns its stored reply again. Brute-force guard: additive `notifications.answerFailedAttempts?: number` (§2), same shape as `invites.failedAttempts` — `LIMITS.push.maxAnswerTokenAttempts` (10) failed verifications lock out further attempts against that notification. New secret `PUSH_ANSWER_SECRET` (scripts/env.manifest.json, gate G3) — generate with `node scripts/secrets.mjs gen PUSH_ANSWER_SECRET`, then `sync-convex`. |
| 0.10 | Oct 26 | **Pending approval.** G3 backend build: the proactive engine (PLAN.md -> Proactive engine) is real — triggers (cross-member "matters to", reminders due, a daily check-in greeting, MEGA-to-MEGA requests) -> candidate (`convex/model/proactive.ts`) -> draft+judge (one combined Muse Spark structured call; requests skip it, their text is already written by the asking member) -> timing (quiet hours, daily cap, `ctx.scheduler.runAt`/`cancel`) -> deliver (push via a new `PushSender` port + Expo adapter, mirrored into the recipient's thread) -> `notifications.answer`/`requests.respond` now run real effects (tell the requester, run the request's declared `onAccept` through the SAME tool dispatcher a chat tool call uses, reschedule/acknowledge a reminder), idempotently, and record `👍`/`👎` into `profiles.proactive` via `chat.react`. Day-1 status: `requests.respond` and `notifications.answer` move from `stub` to `real`. Additive schema fields: `candidates.source` (which trigger produced it), `notifications.reminderId`/`requestId` (back-links an answer button acts on), `requests.onAccept` (what accepting it actually does — only `lists_add` for now). New config: `shared/config/proactive.ts` (check-in time, trigger windows, dedupe-key builders). New internal-only module `convex/proactive.ts` + `convex/crons.ts` (no public API change — CONTRACT §4 lists no `proactive.*` functions, delivery is automatic). `clock.jump` now fires the exact same per-family sweep the production cron runs, instead of its old inline "release held notifications" snippet. |
| 0.9 | Oct 26 | **Pending approval.** G2 security review fix, additive: `usage.reservedCents?: number` (§2) — the spend guard's `requireBudget` (convex/model/spend.ts) used to be check-then-act (it only read already-*recorded* cents, and the real model call happens in between the check and recording the real cost, so two concurrent turns could each pass and together overshoot a cap); it now reserves its estimate on this field atomically with the check, and `recordUsage`/the new `releaseReservation` release it. Internal plumbing only (`convex/spend.ts`'s internal mutations) — no public-API shape change. |
| 0.8 | Oct 26 | **Pending approval.** G2 backend build. Additive: `chat.answerBlock` returns gain `streamId?: string` — when answering a block feeds the answer back into the agent loop and the same MEGA replies (G2: the loop is real now), this is that reply's persistent-text-streaming stream id, so talk mode can caption it exactly like a normal `chat.send` reply; `undefined` when there was no MEGA to reply as. Day-1 status corrected (not a shape change): `chat.send`, `chat.answerBlock` and `talk.transcribe` move from `stub` to `real` — the agent loop, memory writer and a real Transcriber/ChatModel call are wired in (convex/agent/*, convex/adapters/*). `talk.transcribe` also now validates the uploaded recording's format: the frontend records AAC `.m4a` (iOS/Android) or `audio/webm` (web) since `expo-audio` can't record WAV cross-platform, but Meta's `/v1/asr/transcribe` only accepts WAV (mono 16-bit PCM, 16/24 kHz, checked against the Voice API reference Oct 26) — a non-WAV upload is refused with `VALIDATION` rather than transcoded or silently sent wrong. |
| 0.7 | Oct 26 | Removed the `chat.stream` HTTP route: replies are server-driven (`chat.send` schedules the reply; clients watch `chat.streamBody`). Found in the G1 browser check: the client-driven route never ran, so replies stuck at "…" (pending approval) |
| 0.6 | Oct 26 | **Pending approval.** G1 fixes: additive query `notifications.get` (§4, "Settings and push") — returns the full `notificationDoc` so the chat thread's `{ kind: 'notification', notificationId }` card (§3) can render real content (MEGA name, title, body, buttons) instead of the word "Notification"; only the notification's recipient may read it, same `NOT_FOUND`/`FORBIDDEN` rule as `notifications.answer`. Not a function change, but worth noting here: `today.get`'s `waitingOnYou` no longer double-lists a request and its own linked notification (a notification with `requests.notificationId` pointing to it is omitted once its request is listed). |
| 0.5 | Oct 26 | **Pending approval.** G1 security fix: `invites.redeem` changed from a mutation (`m`) to an action (`a`) — **not additive**, both tracks must update their call site (frontend: `useAction` instead of `useMutation`). Needed so a wrong parent-code guess can still bump `invites.failedAttempts` (see 0.4 below) even though the call itself reports `WRONG_PARENT_CODE`: Convex mutations are atomic (a write made earlier in a mutation handler is rolled back if that handler later throws, and this holds even for a mutation nested via `ctx.runMutation`, since it's only a sub-transaction of the same top-level call), so only an action's independently-committed `ctx.runMutation` calls can commit the counter and still fail the overall call. |
| 0.4 | Oct 26 | **Pending approval.** Additive: new query `sharing.get` (§4, "MEGA profile, memory and learnings") — the viewer's own `sharing` row, or `null` for kids (who have none). Requested by the frontend track; backend implemented it as `real` and covered it in the privacy grid. Also additive: new mutation `demo.signInAs` (§4, new "Demo" row), replacing the ad hoc `/demo-signin` HTTP route it had before G1 — same DEMO_MODE gate, but now args/returns-checked and covered by the privacy grid like every other function. The route and its internal helper (`auth.linkSampleMember`) are removed. Also additive: `invites.failedAttempts?: number` (§2) — a per-invite wrong-parent-code counter; `invites.redeem` locks the invite `RATE_LIMITED` at `LIMITS.maxParentCodeAttempts` (brute-force guard, G1 fix). |
| 0.1 | Oct 26 | First draft for review |
| 0.3 | Oct 26 | G0 build: optional fields where a value can't exist yet (`families.adminId`, `createdBy`/`addedBy` on seeded or imported rows, `notifications.candidateId`/`messageId`/`sentAt`); index names now all start with the family; `ShareLevel` enum named; scope keys use the family's id; §4 is machine-readable in `shared/domain/api.ts` |
| 0.2 | Oct 26 | Spoken MEGA names (`SpokenMention`, detection in `talk.transcribe` and `chat.send`); open questions decided |

## Rules
1. **One definition.** Every shape below becomes a Convex validator in `shared/domain/`. The database schema, function `args`/`returns` and the app's TypeScript types (`Infer<typeof …>`) all come from that one definition.
2. **Every public function has `args` and `returns` validators.** Convex checks return values at runtime, so a backend that breaks the contract fails loudly.
3. **The caller is never an argument.** No function takes `memberId`/`familyId` to mean "me". The server builds the **viewer** from the signed-in user (`authComponent.safeGetAuthUser(ctx)` → `members.by_authId`). Functions that act on *another* member take that member's id and check permissions on the server.
4. **Changes while the two tracks run in parallel:** adding an optional field or a new function is allowed, and gets logged in the changelog. Renaming, removing or tightening anything needs both sides to agree and a version bump.
5. **Time:** instants are `number` (ms since epoch) from the `Clock` port, never `Date.now()` in feature code. All-day dates are `"YYYY-MM-DD"` strings. Each family has an IANA `timezone`.
6. **Words:** `role` = kid / adult / admin (what the person can do). `scope` = who can read a memory (family / adults / personal / shared). PLAN.md's "learning levels" are scopes.
7. **Errors:** thrown as `ConvexError({ code, message })`. `code` comes from a fixed list (§9).

---

## 1. Enums (`shared/domain/enums`)
| Name | Values |
|---|---|
| `Role` | `admin` · `adult` · `kid` |
| `Relationship` | `partner` · `daughter` · `son` · `child` · `parent` · `sibling` · `grandparent` · `other` |
| `MegaKind` | `family` (coordinator) · `member` · `care` (for a toddler, used by parents) |
| `Personality` | `calm` · `cheerful` · `funny` · `brief` |
| `Scope` | `family` · `adults` · `personal` · `shared` |
| `MemoryKind` | `fact` · `preference` · `routine` · `plan` · `relationship` · `place` · `note` · `style` |
| `LearningTrigger` | `explicit` · `correction` · `stated` · `pattern` · `reaction` |
| `NotificationKind` | `reminder` · `request` · `tip` · `update` |
| `Delivery` | `push` · `statement` (widget / Today / morning greeting) · `drop` |
| `Loudness` | `timeSensitive` · `active` · `passive` (maps to iOS `interruptionLevel` and an Android channel) |
| `ThemeName` | `midnight` · `light` |
| `Station` | `desk` · `calendar` · `fridge` · `mailbox` · `bookshelf` · `rug` · `charger` · `door` |
| `Via` | `text` · `voice` · `block` · `push` · `widget` |
| `Platform` | `ios` · `android` · `web` |
| `Reaction` | `up` · `down` |

Values that are config rather than enums (the id lists live in `shared/config/ids.ts`, and the validators check membership): sticker ids, wallpaper presets, button sets. Furniture kinds join them with the room config (G5).

---

## 2. Tables (`convex/schema.ts`, built from `shared/domain`)
Every row in a family-owned table has `familyId`, and every index starts with `familyId`. **No query may read across families.**

### Family and people
**families**: `name`, `timezone`, `adminId?: id(members)` (set right after the admin member is created), `parentCode: string` (5 digits; shown to the admin in Settings, so it's stored rather than hashed and only `family.parentCode` returns it), `createdAt`, `country?` (v0.16: ISO 3166-1 alpha-2 for public holidays; `HOLIDAYS.defaultCountry` when empty)

**members**: `familyId`, `name`, `role: Role`, `authId?: string` (Better Auth user id; empty for the toddler), `birthday?: "YYYY-MM-DD"`, `grade?: string`, `activities: string[]`, `hasMega: boolean`, `joinedAt?`
- indexes: `by_family`, `by_authId` (no family prefix: used at sign-in, before the family is known)

**relationships**: `familyId`, `from: id(members)`, `to: id(members)`, `kind: Relationship` ("from is to's daughter")
- index: `by_family_from`

**megas**: `familyId`, `kind: MegaKind`, `ownerId?: id(members)` (empty for the family MEGA; for a care MEGA it's the child), `name`, `look: { hex: string, sticker: string, antenna?: AntennaId, eyes?: EyeStyleId, eyeColor?: EyeColorId }` (v0.13: Store look parts, missing = `classic`; a kid may only wear parts they own), `personality: Personality`, `job: { station: Station, label: string, busy: boolean, since: number }`
- index: `by_family_owner` (its familyId prefix lists a family's MEGAs)

**invites**: `familyId`, `memberId`, `tokenHash`, `expiresAt`, `redeemedAt?`, `failedAttempts?: number` (wrong parent-code guesses; `invites.redeem` locks the invite RATE_LIMITED at `LIMITS.maxParentCodeAttempts`), `invitedBy?: Id<members>`, `mega?: { name, look, personality }` (v0.14: the MEGA the person gets on joining)
- indexes: `by_tokenHash` (no family prefix: used when joining), `by_family_member`

**grants**: `familyId`, `ownerId`, `granteeIds: id(members)[]`, `label` (sharing: "running late → Coral")

**sharing**: `familyId`, `memberId`, `schedule | lists | hqActivity: ShareLevel` (`me` · `partner` · `family`) (MEGA profile → What it shares)

**kidControls**: `familyId`, `memberId`, `homeworkMode: boolean`, `quietHours: { start: "HH:MM", end: "HH:MM" }`, `dailyMinutes?: number`, `blockedTopics: string[]`, `tellsParents: { safety: true, blockedSearches: boolean, summary: "none" | "daily" | "weekly" }`, `parentsCanReadChat: boolean` (default true), `webSearch: boolean` (default true)

**settings**: `familyId`, `memberId`, `theme: ThemeName`, `accent: "theme" | "mega" | { hex: string }`, `wallpaper: { kind: "preset", id } | { kind: "photo", storageId } | { kind: "generated", imageId } | null`, `notify: { loudKinds: NotificationKind[], quietHours, dailyCap: number }`, `pushTokens: { token, platform: Platform }[]`

### Chat
**threads**: `familyId`, `ownerId: id(members)` (one private thread per member to start), `megaIds: id(megas)[]` (the owner's MEGA plus any @'d), `lastAt`, `startedAt?` (v0.13b: when `chat.start` handled the first open)

**messages**: `familyId`, `threadId`, `at`, `author: { kind: "member", id } | { kind: "mega", id } | { kind: "system" }`, `via: Via`, `body: MessageBody` (§3), `streamId?: string` (while the reply is streaming), `chips: SaveChip[]`, `reaction?: Reaction`, `fromNotificationId?`
- index: `by_family_thread_at`

### Memory and learning
**memories**: `familyId`, `scope: Scope`, `scopeKey: string` (`<familyId>:family` · `<familyId>:adults` · `<familyId>:personal:<memberId>` · `<familyId>:shared:<grantId>`), `about: id(members)[]`, `kind: MemoryKind`, `text`, `data?: any`, `source: { kind: "message" | "onboarding" | "integration" | "admin" | "profiler", ref?: string }`, `trigger: LearningTrigger`, `confidence: number` (0–1), `confirmed: boolean`, `sensitive: boolean`, `validUntil?`, `supersedes?: id(memories)`, `pinned: boolean`, `createdAt`, `lastUsedAt`, `gate?: { decidedBy: "rule:<id>" | "model:<id>", reason? }` (v0.13: what decided `sensitive`; rules may only make things more private)
- search index `search_text` on `text`, filtered by `familyId` and `scopeKey`
- indexes: `by_family_scopeKey`, `by_family_kind`

**profiles**: `familyId`, `memberId`, `callMe`, `basics: {…}`, `routines: { text, days: number[], time?: "HH:MM", confirmed }[]`, `places: { label: "home" | "school" | "work" | string, address, lat, lng }[]`, `proactive: Record<NotificationKind, { sent, answered, ignored, up, down }>`, `checkQuestions: { memoryId, question, askAfter }[]`

### Plans and lists
**events**: `familyId`, `title`, `start`, `end?`, `allDay?: "YYYY-MM-DD"`, `who: id(members)[]`, `place?`, `source: "mega" | "ics" | "device" | "gmail" | "google"` (v0.17: `gmail`, `google`), `externalId?`, `integrationId?: id(integrations)` (v0.17: the integration that brought it in; always the owner's private layer), `createdBy?` (empty for imported events), `scope: Scope`, `cancelled: boolean`, `ownerId?: id(members)` (v0.13: owner of a private-layer event), `placeId?: id(places)` (v0.15: the saved place it's at; `place` stays the free text)
- index: `by_family_start`
- **Layers (v0.13):** an event's layer is derived from `scope` only (`shared/config/calendar.ts` `LAYER_OF_SCOPE`): `family`/`adults` = **household** (Hub checks these for clashes); `personal` = **private** (only `ownerId` sees it; never read by the clash checker, gift ideas, bedtime prep or another member's MEGA; `who` does not grant sight); `shared` = a grant, not household. Only the owner's `events.share` / `shareSuggestions.answer` moves a private event to the household layer.

**reminders**: `familyId`, `forMemberId`, `text`, `dueAt`, `eventId?`, `done: boolean`, `createdBy?`
- index: `by_family_member_due`

**lists**: `familyId`, `name`, `scope: Scope`, `ownerId?`
**listItems**: `familyId`, `listId`, `text`, `checked: boolean`, `addedBy?`, `at`
- indexes: lists `by_family`; listItems `by_family_list`

### Proactive and notifications
**familyEvents** (the log): `familyId`, `at`, `type` (`said` · `calendar.changed` · `list.changed` · `reminder.due` · `weather.alert` · `notification.answered` · `clock.tick` · `job.changed`), `payload: any`, `processed: { memory, profiler, triggers }`
- index: `by_family_at`

**candidates**: `familyId`, `recipientId`, `kind: NotificationKind`, `dedupeKey`, `draft: { text, buttons: ButtonSetId }`, `score?: number`, `reason?`, `delivery?: Delivery`, `window: { from, to }`, `deliverAt?`, `scheduledId?`, `status: "new" | "scheduled" | "delivered" | "dropped" | "cancelled"`, `source?: { kind: "reminder", reminderId } | { kind: "request", requestId } | { kind: "checkin", memberId } | { kind: "mattersTo", fromMemberId, familyEventId }` (v0.10, additive — which trigger produced it; internal only, never returned by any API function)
- indexes: `by_family_dedupeKey`, `by_family_status`

**notifications**: `familyId`, `recipientId`, `candidateId?`, `kind`, `loudness: Loudness`, `title`, `body`, `megaId`, `buttons: Button[]`, `messageId?` (the same card in the thread), `sentAt?` (empty while held), `heldUntil?` (kid quiet hours), `answer?: { buttonId, at, via: Via }`, `reply?: string` (lock-screen reply), `reminderId?`, `requestId?` (v0.10, additive — back-links the row a button's real effect, `notifications.answer`, acts on), `choreId?` (v0.13: a chore reminder's "Done" claims it)
- index: `by_family_recipient` (familyId, recipientId, sentAt)

**requests** (MEGA to MEGA): `familyId`, `fromMemberId`, `toMemberId`, `text`, `status: "open" | "accepted" | "declined" | "done"`, `notificationId?`, `onAccept?: { tool: "lists_add", listName, text }` (v0.10, additive — what accepting it actually does, declared by the `ask_member` tool call that created it, never inferred from `text` at answer time)
- index: `by_family_to`

### Layers, sharing and clashes (v0.13, gate GD)
**shareActions**: `familyId`, `ownerId`, `item: { kind: "event", eventId } | { kind: "memory", memoryId }` (v0.13a: memory too), `action: "share" | "unshare"`, `fromScope`, `toScope`, `at`, `suggestionId?` — append-only; written only by the owner's own `events.share` / `.unshare` / `shareSuggestions.answer`, in the same mutation as the scope change
- index: `by_family_owner`

**shareSuggestions**: `familyId`, `ownerId`, `item: { kind: "event", eventId } | { kind: "memory", memoryId }`, `preview` (what the household would see), `audience: id(members)[]`, `status: "pending" | "shared" | "kept" | "expired"`, `createdAt`, `answeredAt?`, `decidedBy` (what proposed it), `messageId?` — only ever readable by `ownerId`; never changes anything by itself (the memory writer's "matters to" becomes one of these)
- index: `by_family_owner_status`

**collisions** (internal; no public function returns it): `familyId`, `eventIds: id(events)[]` (exactly 2, both household), `memberId` (needed in both), `dedupeKey`, `fingerprint?` (v0.14a), `detectedAt`, `status: "open" | "resolved" | "dismissed" | "stale"`
- indexes: `by_family_dedupeKey`, `by_family_status`

**proposals**: `familyId`, `collisionId`, `megaId` (Hub, disclosed as AI), `fix: { kind: "reassign", eventId, from, to } | { kind: "move", eventId, start, end? }`, `title`, `text` (worded by Muse Wonder), `before` / `after: { eventId, title, start, end?, who }`, `wordedBy`, `reasonedBy`, `audience: id(members)[]` (membership when made), `status: "pending" | "approved" | "rejected" | "expired" | "stale"`, `createdAt`, `expiresAt`, `decision?: { byId, at, approve, audience }`, `messageId?` — nothing changes until the Admin approves
- indexes: `by_family_status`, `by_family_collision`

**giftIdeas**: `familyId`, `forMemberId`, `occasion: "birthday"`, `date`, `basedOn: { label, source: { kind: "memory", memoryId } | { kind: "member", field: "activities" } }[]`, `ideas: { title, why, price?, basedOn: number[], url?, productRefs?: ProductRef[] }[]` (v0.16: `productRefs`, up to `GIFTS.productsPerIdea`; `url` stays the web-search fallback), `status: "queued" | "ready" | "failed"`, `createdBy?`, `createdAt`, `addedToList: number[]` — built only from household-shared facts; never visible to `forMemberId` or kids
- index: `by_family_for`

### Kids: homework, chores, routines, Mega Bucks (v0.13, gate GD)
**homeworkSheets**: `familyId`, `createdBy` (an adult), `storageId`, `status: "reading" | "ready" | "failed"`, `topic?`, `summary?`, `createdAt`
- index: `by_family_creator`

**practiceSets**: `familyId`, `sheetId`, `forMemberId` (a kid), `createdBy`, `status: "drafting" | "ready" | "done" | "failed"`, `questions: { id, prompt, choices: string[], answerIndex, hint }[]` (`answerIndex` never leaves the server), `createdAt`, `startedAt?`, `finishedAt?`, `summary?: { correct, total, hintsUsed, minutes, note }`
- indexes: `by_family_for`, `by_family_sheet`

**practiceAttempts**: `familyId`, `setId`, `questionId`, `memberId`, `kind: "answer" | "hint"`, `choiceIndex?`, `correct?`, `at`
- index: `by_family_set`

**chores**: `familyId`, `forMemberId`, `title`, `bucks`, `days: number[]`, `time: "HH:MM"`, `createdBy`, `active`
- index: `by_family_for`

**choreClaims**: `familyId`, `choreId`, `forMemberId`, `date`, `status: "due" | "claimed" | "approved" | "declined"`, `claimedAt?`, `decidedById?`, `decidedAt?`
- indexes: `by_family_chore_date`, `by_family_status`

**routines**: `familyId`, `memberId`, `kind: "morning" | "bedtime"`, `steps: { id, label, detail? }[]`, `time`, `days`, `updatedBy?`
- index: `by_family_member_kind`

**routineRuns**: `familyId`, `routineId`, `memberId`, `kind`, `date`, `steps: { id, label, detail?, done, source?: { eventId, title?, start? } }[]` (v0.13a: `title`; v0.14a: `start`) (bedtime items come only from household-layer events), `createdAt`, `finishedAt?`
- index: `by_family_member_kind_date`

**bucksLedger**: `familyId`, `memberId` (the kid), `delta`, `source: { kind: "practice", setId } | { kind: "chore", claimId } | { kind: "bonus" } | { kind: "purchase", purchaseId }`, `byId`, `note?`, `at` — balance = sum of `delta`, never stored; releases only by adults, spends only by the kid's own purchase
- index: `by_family_member_at`

**purchases**: `familyId`, `memberId`, `itemId: StoreItemId`, `price`, `at`
- index: `by_family_member`

### Places, art and system
**rooms**: `familyId`, `ownerId?` (empty = HQ), `size: { w, h }`, `wallColor`, `furniture: { kind, x, y, color?, posterImageId? }[]`

**images**: `familyId`, `createdBy`, `purpose: "poster" | "wallpaper" | "sticker" | "scene"`, `prompt`, `storageId?`, `status: "queued" | "ready" | "failed"`, `cost?`

**integrations**: `familyId`, `memberId?` (v0.17: required for every kind but the legacy `weather`), `kind: "gmail" | "googleCalendar" | "deviceCalendar" | "ics" | "weather"` (v0.17 adds `gmail`, `googleCalendar`), `config: any` (server-side per kind, never returned as is: `gmail { historyId? }`, `googleCalendar { calendarId, syncToken? }`, `deviceCalendar { calendarIds }`, `ics { url, etag?, lastModified? }`), `lastSyncAt?`, v0.17 optional: `status?: "connecting" | "connected" | "needs_reconnect" | "error" | "disconnected"` (absent = connected), `label?` (account address, feed title), `host?` (ics: shown instead of the URL, which can carry a private token), `lastFailure?: IntegrationFailure`, `lastFailureAt?`, `connectedAt?`, `disconnectedAt?` (tokens never live here: `integrationSecrets`)

**usage**: `familyId`, `day: "YYYY-MM-DD"`, `tokensIn`, `tokensOut`, `searches`, `images`, `cents`, `reservedCents?: number` (v0.9: outstanding pre-call spend estimates not yet released — convex/model/spend.ts)

**clocks**: `familyId`, `mode: "real" | "simulated"`, `offsetMs: number`

### Places, weather, travel and search (v0.15, gate G4)
**places**: `familyId`, `kind: "home" | "school" | "work" | "other"`, `label`, `address`, `lat?`, `lng?`, `geocode: { status: "pending" | "ok" | "failed" | "not_configured" | "seed", at? }`, `createdBy`, `updatedAt` — household data: every member reads; adults (`PLACES.editors`) write; at most one `home`. Coordinates only from the `Geocoder` port (Mapbox, `permanent` results), never the phone. Supersedes `profiles.places`. `outdoor?: boolean` (v0.16): events there get UV and air-quality tips.

**weatherCache**: `familyId`, `placeId`, `kind: "forecast" | "alerts"`, `fetchedAt`, `expiresAt`, `failure?: IntegrationFailure`, `data` (the Weather port's normalized result) — internal; never returned raw.

**travelChecks**: `familyId`, `eventId`, `fromPlaceId`, `toPlaceId`, `departAt`, `minutes?`, `typicalMinutes?`, `distanceMeters?`, `leaveBy?`, `failure?: IntegrationFailure`, `checkedAt` — read only by members who can see the event.

**searchLog**: `familyId`, `memberId`, `at`, `query`, `outcome: "answered" | "rephrased" | "blocked" | "failed"`, `rephrasedTo?`, `category?`, `decidedBy?: "rule:<id>" | "model:<id>"`, `sourceCount`, `messageId?` — the member reads their own; a kid's parents read that kid's `blocked`/`rephrased` rows only when `tellsParents.blockedSearches` is on; siblings never.

`IntegrationFailure = "not_configured" | "no_result" | "rate_limited" | "error"`

### Shopping, price watch and holidays (v0.16, gate G4b)
**priceWatches**: `familyId`, `giftIdeasId`, `ideaIndex`, `forMemberId` (the gift's recipient: never told, never shown), `ref: ProductRef`, `title`, `store`, `url`, `currency`, `baselinePriceCents`, `lastPriceCents?`, `lastCheckedAt?`, `lastFailure?: IntegrationFailure`, `alertedPriceCents?` (dedupe: one alert per watch × price), `status: "watching" | "stopped"`, `createdBy`, `createdAt`, `stoppedBy?`, `stoppedAt?` — made by `gifts.addToList` for each of the idea's products; same audience as gift ideas (adults, never `forMemberId`). The family's own saved item plus the prices our checks observed, not a cached search result.

**routineSkips**: `familyId`, `date`, `holidayName`, `memberIds: id(members)[]` (kids with a morning routine or chore that day), `status: "asked" | "paused" | "kept"`, `askedAt`, `answeredBy?`, `answeredAt?` — one per family × date; adults read and answer; `paused` skips that day's morning routine and chores for `memberIds` and the bedtime prep the night before says so.

**holidays**: `familyId`, `country`, `year`, `list: Holiday[]`, `fetchedAt`, `expiresAt`, `failure?: IntegrationFailure` — internal cache of public holidays (Nager.Date; public data); the app reads `holidays.upcoming`.

`ProductRef = { productId, variantId? }` (Shopify `gid://shopify/p/…` / `gid://shopify/ProductVariant/…`) · `Product = { productId, variantId?, title, priceCents, listPriceCents?, currency, store, url, imageUrl?, available }` (read live, never stored) · `Holiday = { date, name, localName, global, regions?, types: string[] }`


### Onboarding and connected accounts (v0.17, gate G5)
**integrationSecrets**: `familyId`, `memberId`, `provider: "google"`, `accountEmail?`, `refreshToken` (AES-GCM ciphertext under `INTEGRATION_TOKEN_KEY`), `accessToken?` (same), `accessTokenExpiresAt?`, `scopes: string[]` (what Google actually granted), `grantedAt`, `expectedLapseAt?` (Testing mode: +7 days) — **server-only**: no query, view model or log ever contains a field of it. One per member × provider; Gmail and Google Calendar share it.

**oauthStates**: `familyId`, `memberId`, `nonceHash` (SHA-256 of the `state` we send), `want: ("gmail" | "googleCalendar")[]`, `createdAt`, `expiresAt` (`GOOGLE.stateTtlMinutes`), `usedAt?` — single use (web consent CSRF).

**mailItems**: `familyId`, `memberId` (owner), `integrationId`, `gmailMessageId`, `itemIndex`, `kind: "event" | "reminder" | "bill" | "delivery"`, `title`, `sourceLabel` (sender display name only: "From the school office"), `when?` (local `YYYY-MM-DDTHH:MM` or `YYYY-MM-DD`), `amountCents?`, `eventId?`, `reminderId?` (the private copy it made), `status: "added" | "dismissed"`, `foundAt`, `decidedBy` — owner only; never the body or address; dedupe by message × item.

**onboarding**: `familyId`, `memberId`, `step: "name" | "gmail" | "calendar" | "ics" | "family" | "done"`, `outcomes: { gmail?, calendar?, ics? }` (each `"connected" | "skipped"`), `personId?` (the family step's person in progress), `startedAt`, `finishedAt?`.

**profilerRuns**: `familyId`, `memberId`, `day`, `memoriesRead`, `applied`, `asked`, `dropped`, `decidedBy`, `ranAt`, `failure?: IntegrationFailure` — one nightly profiler run per member × day (idempotency, audit).

`ExternalEvent = { externalId, title, start, end?, allDay?, location?, cancelled }` (Google Calendar, ICS and the phone, normalized; `shared/domain/integrationShapes.ts`).

---

## 3. Messages and UI blocks (`shared/domain/messages`, `shared/domain/uiBlocks`)
```
MessageBody =
  | { type: "text", text, mentions?: id(megas)[] }
  | { type: "block", block: UIBlock, answeredWith?: BlockAnswer }   // collapses once answered
  | { type: "answer", blockMessageId, label: string, value: BlockAnswer } // the plain reply bubble
  | { type: "card", card: Card }
  | { type: "image", storageId, caption? }
  | { type: "notice", text }                                        // "From a notification · 2m ago"

UIBlock =
  | { kind: "choice", prompt, options: { id, label }[], multi: boolean, allowOther: boolean }
  | { kind: "toggle", prompt, label, value: boolean, preview?: "theme" }
  | { kind: "text", prompt, placeholder? }
  | { kind: "number", prompt, min?, max? }
  | { kind: "date", prompt, mode: "date" | "time" | "datetime" }
  | { kind: "fields", prompt, fields: { id, label, type: "text" | "date" | "number" }[], skippable: true }
  | { kind: "look", prompt, forMemberId?, value?: { hex, sticker, personality, name } }
  | { kind: "questions", prompt, items: { id, text, default?: string, on: boolean }[] }
  | { kind: "invite", memberId }                                    // app requests the QR and link via invites.create
  | { kind: "confirm", prompt, summary: { label, value }[] }

BlockAnswer = { optionIds?: string[], other?: string, value?: string | number | boolean, fields?: Record<string, string>, skipped?: true }

Card =
  | { kind: "event", eventId, visibleTo: Scope }
  | { kind: "reminder", reminderId, visibleTo: Scope }
  | { kind: "list", listId, added?: string[], visibleTo: Scope }
  | { kind: "search", query, answer, sources: { title, url }[],
      outcome?: "answered" | "rephrased" | "blocked" | "failed", rephrasedTo?, searchLogId? }   // v0.15 fields optional
  | { kind: "weather", summary, at, placeLabel?, hours?: { at, tempF, precipPct, code }[], highF?, lowF?,
      alert?: { event, headline, severity, ends? }, eventId?,                                   // v0.15 fields optional
      air?: { usAqi?, uvIndexMax?, uvAt? }, tip?: "rain" | "uv" | "air" }                        // v0.16 fields optional
  | { kind: "travel", to, leaveBy, minutes, eventId?, fromLabel?, typicalMinutes?, checkId?,
      failure?: IntegrationFailure }                                  // v0.15; with failure, minutes/leaveBy are 0 and the card shows INTEGRATION_COPY
  | { kind: "request", requestId }
  | { kind: "notification", notificationId }                       // a push, mirrored into the thread
  // v0.13 (GD): id-only cards; the app loads each with its query, which re-checks the viewer
  | { kind: "homework", sheetId }                                  // parent: "make practice for…?"
  | { kind: "practice", setId }                                    // kid: practice; parent: summary + release
  | { kind: "chore", claimId }                                     // kid: Done; parent: approve + release
  | { kind: "routine", runId }                                     // kid: morning steps / bedtime prep
  | { kind: "bucks", ledgerId }                                    // kid: "Admin released 5 Mega Bucks!"
  | { kind: "shareSuggestion", suggestionId }                      // owner only
  | { kind: "proposal", proposalId }                               // Hub's clash fix (AI), before/after
  | { kind: "gifts", giftIdeasId }                                 // adults, never the birthday person
  | { kind: "intro" }                                               // v0.13b: a kid's first-open "Here's what we can do" (rows are config)
  // v0.16 (G4b)
  | { kind: "products", query, refs: ProductRef[], failure?: IntegrationFailure } // adults' own thread; details via shopping.products
  | { kind: "priceDrop", watchId }                                 // adults who can see the gift ideas, never the recipient
  | { kind: "holiday", skipId }                                    // adults: "Pause the morning routine and chores?"
  // v0.17 (G5): owner-only, in the member's own thread
  | { kind: "connect", offer: "gmail" | "calendar" | "ics" }       // an integration offer; live state via integrations.offer
  | { kind: "mailFound", integrationId, itemIds: id(mailItems)[] } // what MEGA found in Gmail; rows via mail.items
  | { kind: "reconnect", integrationId }                           // a Google grant lapsed (Testing: every 7 days)

SaveChip = { memoryId, scope: Scope, label: string }               // "Saved · Family", tap → change scope / forget
```
Kid sizing is decided by the app from `role`; the backend caps the number of options per block from config.

---

## 4. Public API (what the app calls)
This section is mirrored exactly by `shared/domain/api.ts`; `tests/contract.test.ts` fails if they differ.

**q** = query, **m** = mutation, **a** = action, **h** = HTTP route. In the "Day 1" column, **real** means it works against seeded data on day 1, and **stub** means it returns correctly shaped canned data until the backend track fills it in.

### Session and onboarding
| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `me.get` | q | — | `Viewer \| null` where `Viewer = { member, family, mega, settings, theme: ResolvedTheme, isParentOf: id(members)[] }` | real |
| `onboarding.start` | m | `{ familyName, timezone, myName, look: { hex, sticker }, personality, megaName }` | `{ familyId, threadId }` (creates the family, admin, MEGA and thread; the rest happens in chat) | real |
| `invites.create` | m | `{ memberId, mega?: { name, look, personality } }` | `{ url, qrPayload, expiresAt }` | real |
| `invites.preview` | q | `{ token }` (callable signed out) | `{ status: 'invalid' } \| { status: 'expired' \| 'locked', inviterName } \| { status: 'ok', kind: 'adult' \| 'kid', inviterName, memberName, mega, family: { name, hex, sticker }[] }` | real |
| `invites.redeem` | a | `{ token, parentCode?: string, mega?: { name, look, personality } }` (code required for kids; `mega` adults only) | `{ memberId }` | real |
| `invites.forMember` | q | `{ memberId }` (admin or that member's parent; v0.17b) | `{ status: 'none' } \| { status: 'joined' } \| { status: 'pending', expiresAt, invitedByName } \| { status: 'expired', expiresAt }` (never the link) | real |
| `family.parentCode` | q | — (admin only) | `{ code }` | real |

### Chat and talk
| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `chat.thread` | q | `{ paginationOpts }` | page of `Message` (newest first) | real |
| `chat.send` | m | `{ text, mentions?: id(megas)[], via: "text" \| "voice", attachments?: storageId[] }` | `{ messageId, replyMessageId, streamId }` | real (G2: runs the agent loop) |
| `chat.streamBody` | q | `{ streamId }` | `{ text, status }` | real (component) |
| `chat.answerBlock` | m | `{ messageId, answer: BlockAnswer, via: Via }` | `{ answerMessageId, streamId?: string }` (v0.8: `streamId` of the MEGA's follow-up reply, when there is one) | real (G2: feeds the answer back into the agent loop) |
| `chat.react` | m | `{ messageId, reaction: Reaction \| null }` | `null` | real |
| `chat.start` | m | `{}` (the caller's own thread) | `{ started: boolean }` | real (v0.13b: the MEGA's starter, once per thread) |
| `files.uploadUrl` | m | — | `string` | real |
| `talk.transcribe` | a | `{ storageId }` | `{ text, mentions: SpokenMention[] }` (batch; realtime is decided by the day-1 smoke test) | real (G2: a real Transcriber call; throws `VALIDATION` if the upload isn't WAV — see changelog v0.8) |

**Spoken MEGA names (added v0.2):**
- `SpokenMention = { megaId, heard: string, start: number, end: number, confidence: number }`. `start`/`end` are character positions in `text`.
- After transcribing, the server finds MEGA names in the text: a loose sound-alike match against the family's MEGA names first, then Muse Spark only when the match is uncertain (threshold in config).
- The app shows each mention as an `@` chip in the captions, so a wrong match can be removed before sending.
- `chat.send` with `via: "voice"` runs the same detection again on the server and merges the result with the `mentions` the app sends. The detection lives in one module and is used by both functions, so a mention works the same typed or spoken.
- The added MEGA joins the thread exactly as with a typed `@`.

### Today, status, widgets
| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `today.get` | q | — | `{ events: Event[], waitingOnYou: (Request \| Notification)[], lists: ListSummary[], statement?: Statement }` | real |
| `megas.status` | q | `{ megaId }` | `{ station, label, busy }` ("Busy" if not shared) | real |
| `widgets.timeline` | q | — | `WidgetEntry[]` (§6) | real |
| `widgets.next` | q | — | `WidgetTimeline` (§6; v0.18, G8: what the home and lock screen widgets show, own data only) | real |
| `family.comingUp` | q | — | `Event[]` (next 2 hours) | real |

### MEGA profile, memory and learnings
| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `megas.mine` | q | — | `Mega` | real |
| `megas.family` | q | — (any member; v0.13a) | `{ megaId, name, hex, sticker }` (Hub) | real |
| `megas.update` | m | `{ name?, look?, personality? }` (kids can't rename) | `null` | real |
| `sharing.get` | q | — | `{ schedule, lists, hqActivity } \| null` (`null` for a kid, who has no `sharing` row) | real |
| `sharing.set` | m | `{ schedule?, lists?, hqActivity? }` | `null` | real |
| `memories.list` | q | `{ scope?: Scope, search?: string, paginationOpts }` | page of `Memory` (only readable scopes; the full list for admin) | real |
| `memories.forget` | m | `{ memoryId }` | `null` | real |
| `memories.changeScope` | m | `{ memoryId, scope: Scope, granteeIds? }` | `null` | real |
| `megas.activity` | q | `{ paginationOpts }` (admin) | page of `familyEvents` summaries `{ at, type, summary, decidedBy? }` (v0.17b: `rule:…` / `model:…` / `member`) | real |

### Family
| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `family.members` | q | — | `MemberCard[]` (member + MEGA badge + role + status) | real |
| `family.member` | q | `{ memberId }` | `MemberDetail` (+ `kidControls` if the viewer is their parent) | real |
| `kidControls.set` | m | `{ memberId, patch: Partial<KidControls> }` (parents only) | `null` | real |
| `kidControls.mine` | q | — (v0.17b; the kid's own, read-only) | `KidControls` fields + `dailyCap` (buzzes a day) + `parents` (their parents' names), or `null` for adults | real |
| `kidControls.setDailyCap` | m | `{ memberId, dailyCap }` (v0.17b; the kid's parents; `LIMITS.push.kidDailyCapRange`) | `null` | real |
| `kidControls.dailyCap` | q | `{ memberId }` (v0.17b reconcile; the kid's parents, else FORBIDDEN) | `{ dailyCap }` (the range is `LIMITS.push.kidDailyCapRange`) | real |
| `family.kidThread` | q | `{ memberId, paginationOpts }` (only if `parentsCanReadChat`) | page of `Message` | real |
| `calendar.range` | q | `{ from, to }` | `Event[]` | real |
| `events.create` / `.update` / `.cancel` | m | event fields / `{ eventId, patch }` / `{ eventId }` | `id` / `null` / `null` | real |
| `events.share` / `.unshare` | m | `{ eventId }` (v0.13; the event's owner only) | `null` (moves it between the owner's private layer and the household layer and writes a `shareActions` row) | real |
| `lists.all` | q | — | `{ list, items }[]` | real |
| `lists.addItem` / `.check` / `.remove` | m | `{ listId, text }` / `{ itemId, checked }` / `{ itemId }` | `id` / `null` / `null` | real |
| `requests.respond` | m | `{ requestId, accept: boolean }` | `null` | real (G3: real effects, idempotent) |

### HQ and rooms
| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `hq.room` | q | `{ ownerId?: id(members) }` (empty = HQ) | `{ room: Room, megas: { megaId, station, label, busy }[], narration: string }` | real |
| `rooms.update` | m | `{ furniture, wallColor? }` (own room only) | `null` | real |
| `images.create` | m | `{ purpose: "poster" \| "wallpaper", prompt }` (adults for wallpaper; spends credits) | `{ imageId }` (status changes to ready later) | stub (no spend) |
| `images.get` | q | `{ imageId }` | `{ status, url? }` | real |

### Settings and push
| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `settings.set` | m | `{ theme?, accent?, wallpaper?, notify? }` (adult fields refused for kids) | `null` | real |
| `push.register` | m | `{ token, platform }` | `null` | real |
| `notifications.answer` | m | `{ notificationId, buttonId, via: "push" \| "block" \| "widget" }` | `{ reply: string }` (shown on the lock screen) | real (G3: real effects, idempotent — see risk note below) |
| `notifications.get` | q | `{ notificationId }` | `notificationDoc` (recipient only) | real |

### Demo
| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `clock.get` | q | — | `{ now, mode }` | real |
| `clock.jump` | m | `{ to: number }` (admin, demo flag on) | `null` (fires due jobs through the same code) | real |
| `demo.signInAs` | m | `{ as: "admin" \| "partner" \| "twin1" \| "twin2" }` (requires a signed-in identity, anonymous is fine; demo flag on) | `null` (links the chosen sample member's authId to the caller, unlinking whichever member it was linked to before) | real |

### Demo features (v0.13, gate GD; real since the GD backend)
Who may call each is stated in its comment in `shared/domain/api.ts`; the rules in brief: kids act only on their own practice, chores, routines and Store; releases, chores, homework and gifts are adults; clash approval is the Admin; share suggestions are the owner's alone.

| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `shareSuggestions.mine` | q | — (the caller's own) | `ShareSuggestion[]` (pending) | real |
| `shareSuggestions.get` | q | `{ suggestionId }` (owner only) | `ShareSuggestion` | real |
| `shareSuggestions.answer` | m | `{ suggestionId, share: boolean }` (owner only) | `null` | real |
| `proposals.open` | q | — (adults) | `ProposalView[]` = `{ proposal, mega: { megaId, name, hex, sticker }, disclosure, clashEventIds }` (v0.13a: `clashEventIds`) | real |
| `proposals.get` | q | `{ proposalId }` (adults) | `ProposalView` | real |
| `proposals.decide` | m | `{ proposalId, approve: boolean }` (admin) | `null` (approve applies the fix; refused if not pending, expired, or membership changed) | real |
| `gifts.upcoming` | q | — (adults, never the person they're for) | `GiftIdeas[]` | real |
| `gifts.get` | q | `{ giftIdeasId }` (same rule) | `GiftIdeas` | real |
| `gifts.generate` | m | `{ forMemberId }` (adults, not for themselves) | `{ giftIdeasId }` (queued) | real |
| `gifts.addToList` | m | `{ giftIdeasId, index }` (adults) | `id(listItems)` | real |
| `homework.submit` | m | `{ storageId }` (adults) | `{ sheetId }` (Muse Spark reads it in the background) | real |
| `homework.sheet` | q | `{ sheetId }` (adults) | `HomeworkSheet` | real |
| `homework.makePractice` | m | `{ sheetId, forMemberId, count }` (a parent of the kid) | `{ setId }` | real |
| `practice.get` | q | `{ setId }` (the kid, or their parents) | `PracticeView` (no correct answers, for anyone) | real |
| `practice.answer` | m | `{ setId, questionId, choiceIndex }` (the kid) | `{ correct, hint?, done }` | real |
| `practice.hint` | m | `{ setId, questionId }` (the kid) | `{ hint }` | real |
| `chores.list` | q | `{ memberId? }` (a kid: own; adults: any kid) | `{ chore, today: ChoreClaim \| null }[]` | real |
| `chores.claim` | q | `{ claimId }` (the kid, or adults) | `{ chore, today }` | real |
| `chores.create` / `.update` | m | `{ forMemberId, title, bucks?, days, time }` / `{ choreId, patch }` (adults) | `id` / `null` | real |
| `chores.markDone` | m | `{ choreId }` (the kid) | `id(choreClaims)` | real |
| `chores.snooze` | m | `{ choreId }` (the kid, today's due instance) | `{ remindAt }` | real |
| `chores.decline` | m | `{ claimId }` (adults) | `null` | real |
| `routines.today` | q | `{ kind, memberId? }` (the kid, or their parents) | `RoutineRun \| null` | real |
| `routines.get` | q | `{ kind, memberId }` (the kid, or their parents) | `Routine \| null` | real |
| `routines.run` | q | `{ runId }` (the kid, or their parents; v0.13a) | `RoutineRun` | real |
| `routines.check` | m | `{ runId, stepId, done }` (the kid) | `null` | real |
| `routines.set` | m | `{ memberId, kind, steps, time, days }` (a parent) | `null` | real |
| `bucks.balance` | q | `{ memberId? }` (a kid: own; adults: any kid) | `{ balance }` | real |
| `bucks.history` | q | `{ memberId?, paginationOpts }` (same) | page of `BucksLedger` | real |
| `bucks.entry` | q | `{ ledgerId }` (a kid: own rows; adults: any kid's; v0.13a) | `BucksLedger` | real |
| `bucks.release` | m | `{ source: { kind: "practice", setId } \| { kind: "chore", claimId } \| { kind: "bonus", memberId }, amount }` (adults) | `{ ledgerId, balance }` (idempotent per set / claim) | real |
| `store.catalog` | q | — (kids) | `{ balance, items: { id, label, price, hex?, owned, wearing }[] }` | real |
| `store.buy` | m | `{ itemId }` (kids) | `{ purchaseId, balance }` | real |

### Places, weather, travel and search (v0.15, gate G4; stubs until the G4 backend)
Web search has no public function: it's the agent's `web_search` tool (`chat.send`), and its result is a `search` card in the asker's own thread; likewise the `weather` and `travel_time` tools. `events.create` / `.update` take optional `placeId` (update: `null` clears it).

| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `places.list` | q | — (any member; household data) | `Place[]` (home, school, work, then custom) | real |
| `places.upsert` | m | `{ placeId?, kind, label, address, outdoor? }` (adults; v0.16 `outdoor`) | `id(places)` (a new or changed address queues geocoding) | real |
| `places.remove` | m | `{ placeId }` (adults) | `null` (events keep their free-text `place`) | real |
| `weather.get` | q | `{ placeId? }` (any member; home when omitted) | `WeatherView \| null` = `{ placeId, placeLabel, fetchedAt, stale, failure?, now, hours, today, alerts, air? }` (v0.16 `air: { usAqi?, uvIndex?, uvIndexMax? }`) | real |
| `weather.refresh` | m | `{ placeId? }` (any member) | `{ queued }` (only when the cache is past its TTL) | real |
| `travel.forEvent` | q | `{ eventId }` (members who can see the event) | `TravelView \| null` = `{ eventId, from, to, minutes, typicalMinutes, leaveBy, checkedAt, failure? }` | real |
| `travel.answer` | m | `{ travelCheckId, action: "on_my_way" \| "snooze_5" \| "remind_30_before" }` (members who can see the event; v0.15a) | `{ message, remindAt: number \| null }` (re-reminders are `reminders` rows for the caller; the leave-by push buttons take the same path) | real |
| `search.log` | q | `{ memberId?, paginationOpts }` (own; a parent: a kid's blocked/rephrased rows if `tellsParents.blockedSearches`) | page of `SearchLog` | real |

### Shopping, price watch and holidays (v0.16, gate G4b)
Product search has no public function: it's the adults' `shop_search` agent tool, and its result is a `products` card in the asker's own thread. Gift ideas carry `productRefs` per idea; `gifts.addToList` starts a price watch for each of the added idea's products. Nothing a catalog search returns is stored except refs (Shopify's terms).

| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `shopping.products` | a | `{ refs: ProductRef[] }` (adults; ≤ `SHOPPING.maxLookup`) | `{ products: Product[], failure? }` (live lookup, nothing stored) | real |
| `shopping.watches` | q | — (adults who can see gift ideas, never the recipient) | `PriceWatch[]` (status `watching`) | real |
| `shopping.watch` | q | `{ watchId }` (same) | `PriceWatch` (any status) | real |
| `shopping.unwatch` | m | `{ watchId }` (same; idempotent) | `null` (the push's `stop_watching` takes the same path) | real |
| `holidays.upcoming` | q | `{ days? }` (any member) | `UpcomingHoliday[]` = `{ date, name, localName, global, regions?, types, skip: { skipId, status } \| null }` | real |
| `holidays.question` | q | `{ skipId }` (adults) | `RoutineSkip` | real |
| `holidays.answer` | m | `{ skipId, action: "pause" \| "keep" }` (adults; first answer wins) | `{ message, status }` (the push's `pause` / `keep` take the same path) | real |


### Onboarding chat, connected accounts and found mail (v0.17, gate G5)
The onboarding chat (canvas Screen 13) is **server-driven**: MEGA's lines come from `G5_COPY` (no model call). Order: greeting + "What should I call you?" → the name (typed into the composer: while `onboarding.state.step` is `name`, `chat.send`'s text goes to `onboarding.setName`) → `connect` cards one at a time, Gmail → calendar → schedule links (each with Not now = `onboarding.skip`) → the family step ("Who should I add first?" as a `choice` block; the person's blocks are answered with `chat.answerBlock` and go through `family.add` + `invites.create`) → `done`. Everything an integration finds lands in the owner's **private** layer; MEGA may suggest sharing (`shareSuggestion` card); only the owner's tap shares. **HTTP:** `GET <CONVEX_SITE_URL>/google/oauth/callback?code&state` (Google's redirect; checks the single-use state, exchanges the code, stores the grant, connects, posts the connected line, then redirects to `SITE_URL` + `GOOGLE.returnPath` with `?google=connected|failed&what=…`; never shows a token or error detail).

| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `onboarding.begin` | m | `{ timezone }` (signed in, not a member) | `{ familyId, threadId }` (family, admin, MEGA `ONBOARDING.firstMega`, family MEGA, thread, onboarding row; posts the greeting) | stub |
| `onboarding.state` | q | — | `OnboardingView \| null` = `{ step, outcomes, personId?, callMe? }` | stub |
| `onboarding.setName` | m | `{ name }` (step `name`; prefixes stripped, 1–`ONBOARDING.nameMaxLength`) | `null` (sets name, callMe, family name; posts the Gmail card) | stub |
| `onboarding.skip` | m | `{ offer: "gmail" \| "calendar" \| "ics" }` (idempotent; v0.17b: adults only) | `null` | stub |
| `family.add` | m | `{ name, role: "adult" \| "kid", relationship, mega?: InviteMega, birthday? }` (admin) | `{ memberId }` | stub |
| `integrations.list` | q | — (owner's own only) | `IntegrationView[]` = `{ integrationId, kind, status, label?, host?, connectedAt?, lastSyncAt?, lastFailure?, countThisMonth }` (never the URL, a token or `config`) | stub |
| `integrations.offer` | q | `{ offer }` | `OfferView` = `{ offer, state: "offered" \| "connected" \| "skipped" \| "failed", integrations: IntegrationView[], available: { google }, failure? }` | stub |
| `integrations.googleStart` | m | `{ want: ("gmail" \| "googleCalendar")[], loginHint? }` (web) | `{ authUrl }` (Google consent; read-only scopes, offline, prompt=consent) | stub |
| `integrations.googleConnectCode` | a | `{ serverAuthCode, want }` (iOS, from @react-native-google-signin) | `{ status, failure? }` | stub |
| `integrations.connectDevice` | m | `{ label, calendarIds: string[] }` | `id(integrations)` | stub |
| `integrations.syncDevice` | m | `{ integrationId, windowStart, windowEnd, events: DeviceEventInput[] }` (≤ `DEVICE_CALENDAR.maxEventsPerSync`) | `{ added, updated, removed }` | stub |
| `integrations.addIcs` | a | `{ url }` (https or webcal; ≤ `ICS.maxFeedsPerMember`) | `{ integrationId?, label?, events, failure?, reason? }` (v0.17b `reason`: `unreachable` \| `not_a_calendar` \| `too_large` \| `refused`) | stub |
| `integrations.disconnect` | a | `{ integrationId }` (owner; idempotent) | `null` (revokes the Google grant when it was the last Google integration; removes what it brought in) | stub |
| `integrations.syncNow` | a | `{ integrationId }` (owner; once a minute) | `{ status, failure? }` | stub |
| `mail.items` | q | `{ itemIds }` (owner only; others → NOT_FOUND) | `MailItemView[]` = `{ itemId, kind, title, sourceLabel, when?, amountCents?, status, eventId?, reminderId? }` | stub |
| `mail.dismiss` | m | `{ itemId }` (owner; idempotent) | `null` (removes the item's private event/reminder) | stub |

`DeviceEventInput = { externalId, calendarId, title, start, end?, allDay?, location? }` (what the app reads with expo-calendar `listEvents`).

---

## 5. Push notifications
- **Payload `data`** (every push): `{ v: 1, notificationId, kind: NotificationKind, threadId, messageId, answerToken?: string }`. `answerToken` (v0.11, additive) is an HMAC token scoped to this one notification + recipient, for `POST /push/answer` below — the only way to answer when the app has been killed and there's no signed-in session.
- **Answering a killed app:** `POST <CONVEX_SITE_URL>/push/answer` with JSON `{ notificationId, buttonId, answerToken }` → `{ reply: string }` (fixed 400 `{ error: "invalid request" }` on any failure; idempotent — an already-answered notification returns its existing reply). Used only by the background task (`src/services/backgroundNotificationTask.ts`) when the app was killed; every other answer path still uses `notifications.answer`.
- **Category id** = `ButtonSetId` from config, registered by the app at start with `setNotificationCategoryAsync`. Each button: `{ id, label, opensApp: false }`. Placeholders until we decide the sets:
  - `reminder.default`: `on_my_way` "On my way" · `snooze_5` "Snooze 5 min"
  - `request.default`: `yes` "Yes" · `cant` "I can't"
  - `tip.default` and `update.default`: no buttons
  - `chore.default` (v0.13, v0.13a): `done` "Done" · `snooze_10` "In 10 min" (a kid's chore reminder; Done claims it via `notifications.choreId`; In 10 min re-reminds after `CHORES.snoozeMinutes`)
  - `holiday.default` (v0.16): `pause` "Pause for the day" · `keep` "Keep as usual" (the evening-before-a-holiday question to adults; same effect as `holidays.answer`)
  - `price.default` (v0.16): `stop_watching` "Stop watching" (a gift's price drop; "Open in store" is on the thread card, since a button never opens the app or a browser)
- **Loudness → platform:** `timeSensitive` / `active` / `passive` → iOS `interruptionLevel`; Android channels `mega.loud` and `mega.quiet` (ids in config).
- **Answer path:** a button tap calls `notifications.answer` while the app is running (from the response listener), or **`POST /push/answer`** (v0.11, `h`) when it's been killed — the background notification-response task has no signed-in session, so it sends `{ notificationId, buttonId, answerToken }` (the token from the payload above) instead of relying on auth. The thread block, `notifications.answer`, and `POST /push/answer` all run the same per-kind effect dispatcher (`convex/model/notificationEffects.ts`), so every answer path is recorded the same way. **Idempotent (G3):** an already-answered notification (`answer` already set) returns its stored `reply` again rather than re-running the button's effect — safe for a retried call from either path.

## 6. Deep links and widgets
**Routes:**
- `mega://chat`
- `mega://chat/<messageId>` (scrolls to the message, adds a notice)
- `mega://talk` (opens already listening)
- `mega://today`
- `mega://family/<memberId>`
- `mega://hq` and `mega://hq/<memberId>`
- `mega://join/<token>`

**WidgetEntry:**
```
{ at: number,                       // when this entry becomes current
  kind: "event" | "statement" | "empty",
  title, subtitle?,                  // "Soccer pickup", "in 40 min · Coral"
  who?: { name, hex }[],
  mega: { name, hex, sticker, face },
  link: string }                     // deep link
```
The rule (events in the next 2 hours first, otherwise the top statement) is applied **on the server**. The app only writes the entries into the widget timeline.

**WidgetTimeline** (v0.18, G8; `widgets.next`):
```
{ generatedAt: number,
  mega: { name, hex, sticker, face },          // the viewer's own MEGA
  kid: boolean,                                // kid sizes and copy (boards WidgetsKid*)
  entries: {
    at: number,                                // when it becomes current; the first is "now"
    kind: "soon" | "statement" | "empty" | "stale",
    soon?: { title, startsAt, timeLabel, who: { name, hex }[], private: boolean }[],   // ≤ 3, next 2 hours
    statement?: { text, short },               // the MEGA's top statement (kind "statement")
    link: string }[],                          // mega://today, or mega://chat for a statement
  talkLink: string }                           // mega://talk (the round Talk widget)
```
Built on the server from exactly what the viewer can see in the app: for an adult, the same events `family.comingUp` shows them (board Widgets: You, Twins, Family); for a kid, only household events they're in (`who`) or that are for the whole family (board WidgetsKid); plus their own MEGA's top statement. Another member's private-layer event never appears, even when the viewer is in its `who` (explicit-share rule); a kid's statements are their own MEGA's only. Entries cover `WIDGET_TIMELINE.horizonHours` (≤ `maxEntries`); a new entry starts whenever the "next 2 hours" set changes (an event enters the window, or ends its `startedGraceMinutes` after starting); the last is `stale`. The app writes it with `updateTimeline` (iOS) on foreground, on sign-in and when the subscription changes (at most every `minRefreshSeconds`), and on sign-out or an account switch writes a signed-out snapshot, so a widget never shows the previous person's day.

## 7. Config keys (`shared/config`; owned by the backend, read by both)
- `models.*` (ChatModel, ImageGenerator, Transcriber per role)
- `roles.*` (tabs, tools, block limits, sizing)
- `themes` (Midnight, Light tokens)
- `stickers`
- `personalities` (face and speech pattern)
- `wallpaperPresets`
- `furniture`, `stations`
- `notifications.kinds` (loudness, button set, thresholds `push` and `widget`)
- `buttonSets`
- `proactive` (G3: daily check-in time/window, reminder grace period, cross-member trigger window, production sweep interval, dedupe-key builders)
- `limits` (daily caps, quiet hours defaults, agent max steps, spend per family per day)
- `learningPolicy` (trigger × kind → save now / save unconfirmed / queue / ask / drop, default scope, pattern N and window, fade half-life)
- `kidSafety` (age bands, blocked categories, domains; v0.15: `KID_SAFETY.search` — query check, keyword backstop, answer check, max sources, homework hints)
- `integrations` (v0.15, `shared/config/integrations.ts`: `PLACES`, `GEOCODING`, `WEB_SEARCH`, `WEATHER` (TTLs, poll interval, push/quiet severities, rain threshold), `TRAVEL` (profile, leave-by buffer, lookahead, recheck), `INTEGRATION_COPY`; v0.16: `WEATHER.air`, `uvTipMin`, `aqiTipMin`, `AQI_LEVELS`, `UV_LEVELS`)
- `shopping` (v0.16, `shared/config/shopping.ts`: `SHOPPING` (endpoint, agent profile path, country, limits, price-check interval and drop thresholds, viewers), `HOLIDAYS` (provider, default country, types, ask time, what a pause skips)); `GIFTS.productsPerIdea` / `priceSlackPct`; `G4B_COPY`
- `google` (v0.17, `shared/config/google.ts`: `GOOGLE` (OAuth endpoints, read-only scopes, callback path, env var names, Testing-mode lapse), `GMAIL` (poll interval, first-sync window, per-poll cap, body limit, skipped senders), `GOOGLE_CALENDAR` (poll interval, window)); `onboarding` (v0.17, `shared/config/onboarding.ts`: `ONBOARDING` (first MEGA, name rules, offer order), `ICS`, `DEVICE_CALENDAR`, `PROFILER`); `G5_COPY`
- `widgets` (v0.18, `shared/config/widgets.ts`: `WIDGETS` kinds (fixed at build time), `WIDGET_TIMELINE` (window, grace, max items, horizon, max entries, lock-screen redaction, refresh rate)); `INVITE_SCAN` (auth.ts); `HOMEWORK.capture`; `G8_COPY`
- `demo` (simulated clock allowed)
- `store` (v0.13: `STORE_CATALOG`, `STORE_TABS`, `STORE_RULES`, `MEGA_BUCKS`), `calendar` (`LAYER_OF_SCOPE`, `CLASH`, `GIFTS`), `kids` (`HOMEWORK`, `CHORES`, `ROUTINES`); `models.vision` / `models.wording`; ids `ANTENNA_IDS`, `EYE_STYLE_IDS`, `EYE_COLOR_IDS`, `STORE_ITEM_IDS`, `ROUTINE_KINDS`

## 8. Ports (internal to the backend; listed so the master plan is complete)
`ChatModel.chat({ messages, tools?, schema? })` · `ImageGenerator.generate({ prompt, referenceImage? })` · `Segmenter.segment({ image, prompt })` · `Transcriber.transcribe({ audio })` · `WebSearch.search({ query, instructions?, approximateLocation?, contextSize })` (v0.15; no `safe` flag — Meta's tool has none, so the kid filter runs around it) · `MemoryIndex.search({ scopeKeys, query, limit })` · `Weather.forecast({ lat, lng, timezone, days })` / `.alerts({ lat, lng })` · `Directions.travelTime({ from, to, departAt })` · `Geocoder.geocode({ address, country?, proximity? })` (v0.15) · `ProductCatalog.search({ query, country, maxPriceCents?, limit })` / `.lookup({ refs, country })` → `{ products, notFound }` · `Holidays.list({ year, country })` → `{ holidays }` (v0.16; `WeatherForecast` gains `air?`) — the G4 and G4b ports return `{ ok: true, … } | { ok: false, failure: IntegrationFailure }` · `CalendarFeed.fetch({ url })` · `PushSender.send(...)` · `BlobStore.put/get` · `Clock.now(familyId)` · v0.17 (G5): `GoogleOAuth.configured() / .authUrl({ scopes, state, redirectUri, loginHint? }) / .exchangeCode({ code, redirectUri }) / .refresh({ refreshToken }) / .revoke({ token })` · `MailSource.profile / .listRecent({ newerThanDays, max }) / .history({ startHistoryId, max }) (404 → `stale`) / .getMessage({ id, maxBodyChars })` · `CalendarSource.listEvents({ calendarId, timeZone, syncToken? | timeMin/timeMax, pageToken? })` (410 → `expired`) · `IcsFetcher.fetch({ url, etag?, lastModified?, maxBytes, timeoutMs })`

## 9. Error codes
`UNAUTHENTICATED` · `NOT_A_MEMBER` · `FORBIDDEN` (role or parent check) · `NOT_FOUND` · `INVALID_INVITE` · `WRONG_PARENT_CODE` · `RATE_LIMITED` · `BUDGET_EXCEEDED` · `KID_BLOCKED` (kid filter) · `VALIDATION`

## 10. Seed: the sample family (`seed.sampleFamily`, internal)
Members use generic labels: Admin (MEGA Teal), Partner (MEGA Coral), Twin 1 (MEGA Zap), Twin 2 (MEGA Sunny), Toddler (care MEGA, used by parents). The seed also adds a week of events (from the mockups' `family-data.js`), a Groceries list, a few memories in each scope, one open request (milk) and a kid's held reminder, so every screen has data on day 1. v0.15: four `places` at public Brooklyn landmarks (Home: Grand Army Plaza; School: Brooklyn Museum; Work: Brooklyn Borough Hall; Soccer field: Parade Ground), with fixed coordinates (`geocode.status: "seed"`) — never a real home. v0.16: the Soccer field is `outdoor`; the first gift idea has a sample product ref and a `priceWatches` row (replaced by live catalog results in `seed.resetDemo`); a past Labor Day `routineSkips` row (kept); the 2026 US holidays cached (real dates).

---

## Decisions (Oct 26)
1. Kid wins: no streaks or counters; the celebration animation stays. PLAN.md updated.
2. One private thread per member; MEGAs join when @'d, typed or **spoken** (see `talk.transcribe`). No family group chat yet.
3. Parents can read a kid's chat (`family.kidThread`) but can't reply as the kid.
4. Button sets stay placeholders. A set lives entirely in `shared/config/buttonSets` (ids, labels, which kind uses which set), so trying new ones is a config edit. The app registers notification categories from that config at startup, and answers are handled by button id.
5. Toddler: no login; a care MEGA run by the parents; its memories are adults-scope.
