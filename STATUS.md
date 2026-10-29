# MEGA build status and handoff

Read this first in a new session, then PLAN.md (product and design decisions) and CONTRACT.md (the frontend ↔ backend contract).

_Last updated: Oct 28._

## Where we are

| Gate | Scope | Status |
|---|---|---|
| G0 | Scaffold, contract as code (`shared/`), schema, sample family seed, test harness, secrets script | ✅ committed |
| G1 | Real reads + stubs for every API function, Better Auth sign-in (Apple/Google/invite+parent code/demo), app shell and screens, privacy test grid | ✅ tag `g1` |
| G2 | Real Muse Spark agent loop with tools, memory writer + learning policy + save chips, talk mode (WAV), transcription, spend guard | ✅ tag `g2` (UX fixes `fab39d5`; talk mode still needs an on-device visual pass) |
| G3 | Proactive engine (triggers → draft → judge → timing → deliver), push with buttons (expo-notifications categories), answers → effects, MEGA-to-MEGA requests, widget timeline / Today statements | ✅ tag `g3` (needs owner device test: new dev build for expo-task-manager) |
| GD | Demo features (Screens 9–12): kids (homework, chores, bedtime/morning), Mega Bucks + Store, calendar layers + clash proposals + gift ideas, sign-in redesign (email/Apple/Google, adult and kid invites, MegaLoader), chat starters, OpenDuet learnings (decidedBy, audience-snapshot approvals, evals) | ✅ tag `gd` (Oct 28; needs owner device test on build `323ca3e8`, no new native modules; CONTRACT v0.13–v0.14a pending approval) |
| G4 | Web search with kid filter (+ source screening), weather + NWS alerts, travel time / leave-by (Mapbox, fails closed until MAPBOX_TOKEN), Places, search log; plus Oct 28 UX fixes (walkers never cover content, safe areas, every modal closes, MEGA profile) | ✅ tag `g4` (Oct 28; CONTRACT v0.15/v0.15a pending approval; travel needs the owner's Mapbox token) |
| G4b | **Owner, Oct 28 (before G5):** Shopify Global Catalog products on gift ideas + adults' `shop_search` + price watch (quiet drop alerts, never to the recipient; refs only, per Shopify's no-caching terms); Open-Meteo air quality + UV on the weather card and outdoor-event tips; public holidays (Nager.Date) with an evening-before "Pause the morning routine and chores?" question to adults. Brief `docs/gates/G4b.md`, canvas row Screen 15 (canvas v39) | ✅ tag `g4b` (Oct 28; CONTRACT v0.16–v0.16b pending approval; no owner action needed: keyless Shopify catalog via our agent profile at `/ucp/agent-profile.json`; calendar now pages by week on the family clock) |
| G5 | **Onboarding chat (owner, Oct 28; Screen 13 boards):** sign up → `onboarding.begin` → MEGA asks your name → integration cards one at a time (**Gmail first**: our own read-only Google grant, encrypted server-side, polled from Convex; then Google Calendar or this phone's calendar (expo-calendar SDK 58 API); then ICS links, parsed in-house) → family steps (`family.add` + invites). Plus Settings (incl. Connected accounts), HQ room, Profile pages, nightly profiler + check questions. Brief `docs/gates/G5.md`; contract v0.17 (pending approval); owner's Google Cloud checklist in the brief; design step needed for canvas row Screen 16 (SettingsAccounts, Reconnect, ConnectNotSetUp, IcsPaste, PhoneCalendarPick, MailFoundRemove, ProfileRules, ProfileActivity) | ✅ tag `g5` (Oct 29; CONTRACT v0.17–v0.17b pending approval; the Gmail / Google Calendar live test waits on the owner's Google Cloud setup + `INTEGRATION_TOKEN_KEY` (docs/gates/G5.md owner actions); ICS, phone calendar, onboarding, Settings, HQ, Rules/Activity and the profiler are live) |
| G6 | Full end-to-end on web + iPhone, demo script, polish | |
| G8 | Widgets (`widgets.next` timeline → `MegaNext` / `MegaTalk`, lock-screen redaction of private items, signed-out snapshot), QR invite scan (strict: `mega://join/<token>` or the bare token only), homework live viewfinder, invite Paste (`ClipboardPasteButton`). Brief `docs/gates/G8.md`. All native modules are in dev build `cd4140e3`; gaps for after the freeze: no `accessoryInline` widget family, no background widget refresh | ✅ tag `g8` (Oct 29; CONTRACT v0.18/v0.18a pending approval; widgets, camera and system Paste need the owner's device test on build `cd4140e3`, list in docs/gates/G8.md; post-freeze: accessoryInline family, background refresh, Android widgets) |

**In flight when this was written:** a background agent fixing the G2 UX review findings: white flash on load/sign-in, tabs reflashing loading states (switch all `src/data/*` queries to `useStableQuery` + a lint test), accent text contrast (WCAG-derived `readableOn`), MessageList memoization, hit targets. It then checks choice blocks, talk mode, the kid shell and desktop. When it commits, verify (all checks below), then `git tag -a g2` and start G3.

## Hackathon brief (released Oct 26) — read this before planning any gate

- **Track: Startup** (applied by mistake instead of Indie; the change request to the organizers went unanswered). Judged on technical execution and whether it holds up in production. Rubric: Impact 30%, Use of Meta AI tooling 25%, Demo 25%, Technical depth 20%. Bonus to aim for: Best Agentic Use-Case.
- **Owner decision (Oct 26):** keep MEGA and this repo; the **brief's collision scenario is the demo's centerpiece**. Two members share a household calendar layer and each keeps a private layer. MEGA spots a collision between **shared** items only and proposes one fix (wording: Muse Wonder; everything else: Muse Spark). Nothing changes until a human approves (the pending proposal shows before and after). The agent's identity is disclosed. **Negative control:** A's private event that overlaps B's shared one is never flagged.
- **Demo framing (owner, Oct 27): practical, not technical.** The story is a technical parent who can't be the whole family's assistant, so they hand everyone their own MEGA in minutes, and the MEGAs work together. The collision, the approval and the negative control appear as everyday family moments on real phones (no judges' panel, no architecture slides in the main cut).
- **Demo plan (owner, Oct 27): seeded data first, real use after.** We build and demo on the sample family (real Meta calls on synthetic data); the owner then uses the app for real. The demo shows a family assistant, with extra help for kids:
  - **Calendar** with shared and private layers, and **birthday gift ideas** drawn only from what's shared (plus kid-filtered web search).
  - **Homework:** a parent photographs a worksheet; MEGA writes practice questions at the kid's level, gives **hints, not answers**, and sends the parent a short summary.
  - **Chore reminders**, **bedtime tomorrow-prep** (a checklist from the family calendar) and a **morning routine** walk-through.
  - **Mega Bucks and the Store:** parents release Mega Bucks; kids buy furniture, stickers, MEGA colors, antenna shapes and eye designs (pixel art). Needs canvas boards before code. Replaces the old "no game mechanics" rule (PLAN.md → rooms).
  - **Board decisions (owner, Oct 27):** Store eyes are eye colors plus one pair of anime eyes generated once with Muse Image (one-off generation approved); Admin approves clash fixes; posters stay free and out of the Store. Sign-in: "MEGA" in large letters, and the only tagline is "A little help for the whole family".
  - **Private-event visibility (owner, Oct 28):** "private events arent shared without explicit consent first". This confirms the CONTRACT v0.13 tightening: a personal event is visible only to its owner, even to people listed on it, until the owner shares it. Mark it approved in CONTRACT.md when the GD backend merges.
  - **From the OpenDuet review (Oct 27), for the next build gate:** quick rules in the privacy gate may only make things more private (never release), and every decision records what decided it; approvals record who was in the family when given; a small labeled eval set (synthetic) for the privacy gate and the push judge, with results committed.
  - Homework photos: Muse Spark accepts image input (Meta Model API docs, Oct 27: text, image, video, audio and PDF in, text out; see the image understanding guide at ai.developer.meta.com/docs). Verify the request shape against those docs before coding, and keep it behind the `ChatModel` adapter.
- **Sharing rule (owner, Oct 26): explicit share only.** Nothing crosses from private to shared without the owner's own share action (a ShareAction record). The assistant may *suggest* sharing ("Share this with the household?" → the owner taps yes); it must never act on a guess. No "looks household-related" heuristic, no auto-promotion, no surfacing "just in case". This applies to MEGA's memory too: the writer's "matters to" becomes a share suggestion the owner approves, never an automatic trigger.
- **Rules:** a PUBLIC repo; **synthetic data only** (the organizers get a perpetual licence with no confidentiality), so scrub the real names and home paths still in the design boards, `shared/config/identity.ts`, tests, PLAN/STATUS and `design/build/build.py` before publishing; mark what was built before Oct 26 (`prototypes/megasprite`, the design canvas from Oct 24); the demo must genuinely call Meta models (no mocks); a **3-minute demo video** is a primary artifact, so plan it early.
- **Open decisions for the owner (Oct 28):** push judge eval scored 77% (it holds back 6 of 9 plain statements; privacy gate 100%) — keep cautious or tune; bedtime title shows "4:30 PM" vs the board's "4:30"; web now loads all routes up front (`asyncRoutes.web: false`, needed to avoid a blank frame).
- **Gmail setup (owner, before G5's live check):** in Google Cloud (the project that owns the existing Google sign-in clients) enable the Gmail API and Google Calendar API; on the OAuth consent screen add the scopes `gmail.readonly` and `calendar.readonly`, keep publishing status **Testing**, and add test users (your synthetic demo Gmail account and any family testers; max 100). Create a **synthetic Gmail account** for the demo and seed it with made-up school, dentist and bill emails — never connect real mail in the demo or video (hackathon rule: synthetic data only). Consent lasts 7 days in Testing, so reconnect before recording.
- **Owner-only gates:** claim the $150 Meta credits (form; a card on the account) and verify the key; **employment-IP check** (Credit Acceptance, Infernored) before submitting; due **Nov 4, 9 PM ET** via the Cerebral Valley portal.

## Next up (as of the context clear on Oct 26)

1. **Finish G2 UX fixes.** A background agent was mid-way; its *uncommitted* edits caused a "Too many re-renders" crash in `src/app/(tabs)/chat/_layout.tsx` (`useThemedStackOptions`) that the owner hit on web. It was told to fix that and test both sign-in paths before committing. In the new session: check `git status`/`git log`. If the fixes aren't committed and the agent is gone, re-do them (the list is under "In flight" above), make the crash go away, run all checks, then tag `g2`.
2. ✅ **Login screens designed and approved (Oct 26):** canvas row "Screen 9 · Sign in and joining" (`design/build/Login.template.html`). Decisions: the sign-in sheet sits behind *Make my MEGA* and *Sign in*; walking MEGAs stand on ledges (buttons, cards, headline), dip buttons, react to presses and say hi on tap, and stand still under reduced motion; QR scanning is designed now and built with expo-camera in the G8 native build; Midnight only; Apple and Google use their official native buttons in code; Hub is sky blue (`FAMILY_MEGA_DEFAULTS`; the sample fixture's grey is stale). **To do:** restyle the screens below to match, with a reusable walker layer (HQ reuses it in G5). Original scope:
   - **Welcome / sign in:** Continue with Apple (iOS), Continue with Google, "I have an invite", and the demo list (dev builds only).
   - **I have an invite:** paste a link or scan a QR code.
   - **Kid joining:** the 5-digit parent code (the `KidCode` board exists, and `KidMeet` follows it).
   - **Join or start a family:** shown when signed in without a family, with "Use a different account".
   - **Returning user:** loading → straight into chat (no flash).

   Must match the visual direction (dark Midnight default, the MEGA sprite, accent tokens) and be mobile-first. The current code screens (`src/app/welcome.tsx`, `invite.tsx`, `start.tsx`, `onboarding.tsx` (an interim one-question Start a family), `join/[token].tsx`) are functional placeholders to restyle after the design is approved.
3. Then G3 (the proactive engine and push).

## How we work (owner-approved process)

- **Gates:** each gate passes only with all checks green **and** fresh adversarial reviewers (security/privacy, correctness, **UX**) who didn't write the code; every fix gets a **failing-first regression test**; then a local commit + tag. **Commit locally, never push.** Commit messages end with the Co-Authored-By / Claude-Session lines used in `git log`.
- **Parallel tracks:** backend (`convex/`) and frontend (`src/`) agents in separate git worktrees; they meet only at the contract. The app builds typed refs from `shared/domain/api.ts` (`src/data/api.ts`) and never imports `convex/_generated`.
- **Contract changes:** additive changes are logged in the CONTRACT.md changelog as "pending approval"; breaking changes need the owner's agreement. `tests/contract.test.ts` fails if CONTRACT.md §1/§2/§4/§6/§9 and the code disagree.
- **The design canvas is the spec (owner, Oct 26):** gate order stays as planned, but the end result must look like the approved boards (`design/README.md`). Every gate that touches a screen builds it to its board, and the UX reviewer compares the two side by side. A screen that ships as a placeholder says so in its header comment, along with the gate that replaces it. Placeholders still open: HQ room, onboarding chat and Settings (G5), push (G3), widgets (G8), sign-in restyle (Screen 9 boards, approved Oct 26).
- **UX quality bar (owner's top priority):** mobile-first (the admin sometimes uses desktop); smooth, responsive, intuitive; keyboard-avoiding (react-native-keyboard-controller); Reanimated transitions with theme duration tokens; no flicker (`useStableQuery`, skeletons, stable keys, optimistic sends); no hardcoded colors (enforced by `src/test/noHardcodedColors.test.ts`). A UX reviewer measures web recordings frame by frame each gate.
- **Live browser checks** catch what unit tests miss (web sign-in, streaming, empty model replies were all found this way): Playwright is installed; demo sign-in list on the welcome screen.
- **Native packages are frozen (owner, Oct 28):** every native package the plan needs is installed now and treated as part of the contract, so one dev build covers all remaining gates. Added Oct 28: `expo-widgets` (kinds in `shared/config/widgets.ts`: `MegaNext` small/medium/lock-rectangular, `MegaTalk` lock-circular; App Group `group.com.megafamily.app`), `expo-camera` (QR invites, homework viewfinder), `expo-clipboard` (invite Paste button), `expo-asset` (a missing required peer of expo-audio; likely the Oct 28 device crash), `expo-network` (optional peer of @better-auth/expo); Expo patch versions aligned; `expo-doctor` 20/20. **If execution shows a package must be added or removed, do NOT do it mid-gate: note it here and do it after all gates are done.** Widget kinds are build-time too: don't rename or add kinds until then. **JS-only, allowed (G5 fixes, Oct 29):** `qrcode-generator` (pure JS, MIT, no native code; draws the invite QR with react-native-svg) — the freeze covers native code only, so it needs no new dev build.
- **Owner rules:** current docs before any library use (Context7 first); config/adapter-driven, DRY, single source of truth; rewards only as parent-released Mega Bucks (Oct 27); generic sample labels only (Admin, Partner, Twin 1, Twin 2, Toddler; MEGAs Teal, Coral, Zap, Sunny, Pebble, family MEGA Hub); never `Date.now()` in backend feature code (Clock port).

## Checks (all must pass)

```
npx tsc --noEmit
npx vitest run              # convex/ shared/ tests/ (321 at last count, incl. the privacy grid)
npx jest                    # src/ (131 at last count)
npx eslint src shared --max-warnings=0
node --test scripts/secrets.test.mjs
npx expo export --platform web --output-dir <scratch dir>
```

## Running things

- `npm run dev:web` → http://localhost:8081 (demo sign-in list; mobile viewport is the primary target). `npm run dev` for the iPhone dev client.
- `npx convex dev --once </dev/null` deploys to the cloud dev deployment **colorless-ibis-289** (team brandon-irving, project mega-family). Env there: server secrets, `SITE_URL=http://localhost:8081` (the **web app's** URL; Better Auth crossDomain), `DEMO_MODE=true`, `MEGA_MODEL_ADAPTER=real`.
- Seed: `npx convex run seed:sampleFamily '{}'` (already seeded; demo clock starts Sunday 4:42 PM New York of the seed week).
- `npm run build:ios:dev`: EAS development build (project @birving2/mega). All native modules for every remaining gate (incl. widgets, camera, clipboard) are included as of Oct 28; native packages are frozen until all gates are done.
- `npm run smoke:meta`: Meta API smoke tests.

## Secrets

`.env.secrets` (gitignored) is read only by `scripts/secrets.mjs` (`status`, `sync-convex`, `run --only app|tool -- <cmd>`, `gen`, `apple-key`); **never read or print it**. Output is redacted. Public build vars are in EAS env (development).

## Spend

Owner approved **$5 total for live model checks until G6**; ≈3 cents used. The spend guard (`usage` table, reserved + recorded) enforces daily and global caps. Image generation needs separate approval (off in config).

- **GD evals (Oct 28):** 16.2¢ — privacy gate 6.0¢ (30 cases, 100% precision/recall on "sensitive"), push judge 10.2¢ (30 cases, 77% accuracy; it under-sends "statement"s as drops). Re-run: `node scripts/secrets.mjs run --only tool -- npx tsx evals/run.ts`; results in `evals/*/results-*.md`.
- **G5 (Oct 29):** 4.75¢ — the mail-extraction eval (15 synthetic emails, 100% correct); the live onboarding, ICS and review-fix checks made no model calls.
- **G4b (Oct 28):** ≈3.2¢ — backend live check 2.1¢, weather/air fix live check 1.05¢ (Shopify, Open-Meteo and Nager.Date cost nothing).
- **G4 backend (Oct 28):** 16.4¢ — live checks 10.8¢ (three real searches: an adult's, a kid's rephrased, a kid's blocked; weather and travel calls cost nothing), kid search eval 5.6¢ (20 cases, 95% accuracy; no blocked query was let through as allowed, one "sneak out" query was rephrased instead of blocked).

## Owner to-dos (open)

1. iPhone build (`npm run build:ios:dev`) if not done; then the Apple Services ID (`com.megafamily.app.web`, domain `colorless-ibis-289.convex.site`, return URL `https://colorless-ibis-289.convex.site/api/auth/callback/apple`) + Sign in with Apple key → `node scripts/secrets.mjs apple-key <AuthKey.p8>` → `node scripts/secrets.mjs sync-convex`.
2. Approve CONTRACT.md v0.4–v0.9 (sharing.get, demo.signInAs, parent-code lockout with invites.redeem as an action, notifications.get, server-driven replies, answerBlock streamId, usage.reservedCents).
3. Web walkthrough feedback: the owner hit the re-render crash above; their Google sign-in works and the interim Start a family is in.
4. **Google Cloud for Gmail/Calendar (G5):** the checklist in docs/gates/G5.md → Owner actions, then `node scripts/secrets.mjs gen INTEGRATION_TOKEN_KEY` and `sync-convex`; then complete the consent link once for the synthetic Gmail.
5. **Decisions open (G5 UX review):** Apple sign-in on web (recommended: iPhone only) and desktop chat width (recommended: G6 polish). Also approve CONTRACT v0.13–v0.17b.

## Lessons learned (don't relearn these)
- **Demo Gmail filter (Oct 29):** the dev deployment sets `MEGA_GMAIL_SUBJECT_PREFIX=MEGA_TEST` (`npx convex env set`; not a secret, so not in env.manifest). Gmail then reads only mail whose subject starts with it and strips it before the model. The synthetic inbox is synthetictestuser91@gmail.com; its 10 demo emails were sent through Composio (connection alias `megatest`) and are saved in the session scratchpad. Unset the prefix for real families. The prompt's received date is capped at the family's today (demo clock).

- **Mapbox `depart_at` (Oct 29, live):** UTC needs seconds: `YYYY-MM-DDThh:mm:ssZ`. `hh:mmZ` is a 422 (`hh:mm` is only valid without a zone, local to the start). Past times are accepted, so the pinned demo clock works. MAPBOX_TOKEN is set; permanent geocoding returns 200.

- **Sign in with Apple's client secret (Oct 29):** Convex never finishes async work started at module load, so a JWT signed into a module-level cache at startup stays empty forever (Apple sign-in failed with `CLIENT_ID_AND_SECRET_REQUIRED`, web and native). `secrets.mjs sync-convex` now signs the ES256 JWT locally from the .p8 and sets `APPLE_CLIENT_SECRET` (180 days; **re-run `sync-convex` before 2027-04-27**). `jose` is now unused in app code; remove it after all gates (package freeze).

- **SSRF guard (G5):** Convex actions can't resolve DNS, so the ICS guard checks IP literals (every encoding) and blocked names only; a public hostname that resolves to a private IP isn't caught. Manual redirects (`redirect: 'manual'`) do work in Convex's runtime, so every hop is re-checked.
- **Invites (G5):** only the token's hash is stored, so an invite link can't be shown again; "show invite" makes a new one. The QR carries the full `mega://join/<token>` link; preview/redeem accept link or token (`shared/inviteToken.ts`).

- **Shopify Global Catalog (G4b):** keyless, but every call needs our UCP agent profile URL (`meta["ucp-agent"]`; without it HTTP 422 `invalid_profile_url`). Prices are per **variant**, in minor units; `currency` is only a relevance hint, so the adapter drops non-USD results. Search results and images may not be cached: store refs, read details live (`shopping.products`).
- **Web dev servers for agents:** Better Auth's `trustedOrigins` allows only localhost:8081 and :19006, so a reviewer's own server must use **19006** (8081 is the owner's).
- **Jest load flake (fixed in G8):** RNTL's `asyncUtilTimeout` defaulted to 1 s while jest's `testTimeout` was 20 s, so `findBy`/`waitFor` gave up under full parallel load; `jestSetup.ts` now sets it from `testTimeout`. Fake timers in a test must be restored in `finally`.
- **Widgets run on the device's real clock:** WidgetKit picks entries by the phone's time, so `widgetSync` shifts every server (family Clock) time by `deviceNow − generatedAt`; labels like "4:00 PM" stay in family time.

- **Muse Spark is a reasoning model:** hidden reasoning counts against `max_tokens`. Use `reasoning_effort: 'low'` (config `LIMITS.agent.effort`) and generous limits, or replies come back empty.
- **Meta transcription** is `POST /v1/asr/transcribe` (multipart JSON `request` + `audio`) and accepts **WAV only** (mono 16-bit PCM 16/24 kHz). iOS records LINEARPCM; web re-encodes to WAV in JS; Android expo-audio can't record PCM (shows "not supported").
- **Web search:** `/v1/responses` with `tools: [{ type: 'web_search' }]` (Responses API only, not Chat Completions); sources come from `include: ["web_search_call.results"]` (each `{ type: "text_result", title, url, snippet }`) plus `url_citation` annotations on the answer (what it actually cites); `phase: 'commentary'` messages are interim. No safe-search or domain filter exists, so the kid filter runs around the call (G4 docs check, Oct 28).
- **Better Auth on web** needs the server `crossDomain({ siteUrl })` plugin and `SITE_URL` = the web app's origin.
- **Chat replies are server-driven** (`chat.send` schedules `generateReply`, which writes chunks via the persistent-text-streaming component's `addChunk`); there is no client-driven stream route.
- **Convex mutations are atomic:** a counter written in a mutation that then throws is rolled back, which is why `invites.redeem` is an action (lockout counter).
- **Never trust model-supplied labels for privacy:** memory saves go through an independent classifier + keyword backstop (`convex/model/concernGate.ts`).
- The agent context must state the family's local "now"; tool time args are local `YYYY-MM-DDTHH:MM` strings converted in code.
