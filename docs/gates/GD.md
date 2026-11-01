> Current demo workflow: [Settings → Demo Console](../demo-console.md). The three-person live Gmail scenario and age-group policy in that guide supersede historical demo, seeded-reset, and sample-sign-in instructions below.

# Gate GD · Demo features (between G3 and G4)

The contract is CONTRACT.md v0.13 (pending approval) plus `shared/` (tables, API map, config). Backend owns `convex/`, frontend owns `src/`; they meet only at the contract. Same process as every gate (STATUS.md → How we work): checks green, three fresh reviewers (security/privacy, correctness, UX against the boards), a failing-first test for every fix, local commits only, then tag `gd`.

**Boards (the spec):** canvas Screens 9–12 (`design/build/Login|Kids|Store|Calendar.template.html`, live at the MEGA design canvas). Owner decisions: STATUS.md → Demo plan, Board decisions, OpenDuet learnings, explicit-share rule.

**Models:** Muse Spark (`models.chat` / `judge` / `vision`) does all reasoning: reading the homework photo (image input), writing practice questions and hints, the practice summary note, finding the fix for a clash, bedtime prep items, gift ideas, share-suggestion drafting. **Muse Wonder (`models.wording`) only words the clash fix** (the proposal's `title` + `text`). Real calls on seeded data, through the existing `ChatModel` port and spend guard. Check Meta's current docs (ai.developer.meta.com/docs, image understanding guide) for the image request shape before coding it.

## Invariants (each one gets a test)

1. **Explicit share only.** A `personal` event or memory reaches nobody but its owner until the owner's own `events.share` / `shareSuggestions.answer(share: true)`. Every scope change from private writes a `shareActions` row in the same mutation. No model output, trigger, rule or other member can change it. Test: every write path that can touch `events.scope` / `memories.scope`, called as anyone but the owner, leaves it private.
2. **Private is invisible.** A personal event is visible only to its owner (`ownerId`, else `createdBy`), even to people in its `who` (CONTRACT v0.13 tightening of `convex/model/visibility.ts`). The clash checker, gift ideas, bedtime prep and every MEGA except the owner's never read it.
3. **Negative control.** Admin's private Dentist overlapping a household event is never flagged: no `collisions` row, no proposal, no notification, nothing in Partner's `calendar.range`.
4. **Nothing changes until approved.** A pending proposal leaves both events untouched; `proposals.decide(approve: true)` by the Admin is the only thing that applies the fix. Refused (VALIDATION) if not pending, expired, or the family's membership changed since it was made (audience snapshot).
5. **Hints, never answers.** No API response ever contains `answerIndex` or the correct choice's text as a hint; a drafted hint that contains the correct choice's text is redrafted once, then the question is dropped.
6. **Mega Bucks.** Balance = sum of ledger rows. Only adults release (+), only the kid's own purchase spends (−), one release per practice set / chore claim, no negative balance, no buying twice. A kid wears only parts they own (`megas.update`) and places only furniture they own (`rooms.update`); adults are unrestricted.
7. **Gift ideas** cite only household-shared facts and are never visible to the person they're for or to kids.
8. **Rules only tighten** (OpenDuet): in the concern gate and every new gate, a deterministic rule may only make something more private/held; `decidedBy` records `rule:<id>` or `model:<id>` on `memories.gate`, `shareSuggestions.decidedBy`, `proposals.wordedBy/reasonedBy`.
9. **Privacy grid:** every new table gets its row of targeted within-family checks (who can read/write it), like the existing memories/kidControls checks in `convex/privacy.test.ts`. At gate end the generic grid has **zero skipped** functions (seed fills every new table) and **zero stubs** (`convex/model/gdStub.ts` has no callers; every GD entry in `shared/domain/api.ts` is `day1: 'real'`).

## Backend tasks (`convex/`)

1. **Seed** (`shared/fixtures/sampleFamily.ts` data + `convex/seed.ts` inserts; `seed.resetSampleFamily` too). Synthetic only:
   - Twin 1's birthday ~10–12 days after the seed week (board: "in 12 days, Sunday"), plus shared memories: Twin 1 "loves dinosaurs" (family scope, by Twin 1), "into building sets" (family), Partner's "gift budget about $40" (adults).
   - Thursday: shared soccer practice 4:00–5:00 PM (Twin 1, Twin 2), shared soccer pickup 5:30 PM (`who: [partner]`), Partner's **shared** work dinner 5:00–7:00 PM → the clash. Admin's **private** Dentist 4:00–5:00 PM (`ownerId: admin`) → the negative control. Partner's private Haircut (board CalPartner).
   - Chores: Twin 2 "Dishes" 3 bucks daily 7:00 PM; Twin 1 "Feed the fish". Today's claim for Twin 2 in `claimed` state (board KidsChoreApprove).
   - A synthetic fractions worksheet image under `shared/fixtures/homework/` (made from the board's 6 problems; no real student work), a `homeworkSheets` row (ready) and a practice set for Twin 1 (`done`, 4 of 5, 2 hints) so the summary + release board has data.
   - Routines: morning (config defaults) and bedtime for both twins; tomorrow's bedtime run derives from the shared soccer event.
   - Mega Bucks history: a few releases and one purchase (Twin 1 owns the plant; balance 3 per board StoreEyes, or 8 for StoreConfirm — pick one and note it).
   - One pending share suggestion (Admin's Dentist) and one pending proposal (the clash) so every board renders without waiting on a model.
2. **Layers and sharing:** `events.share` / `.unshare`, `shareSuggestions.*`; tighten `visibility.ts` for personal events; `events.create` sets `ownerId` for personal events. Convert the memory writer's "matters to" (`convex/agent/writer.ts`, `convex/model/proactive.ts` cross-member trigger) into a `shareSuggestions` row (item kind memory) to the memory's owner; the cross-member push no longer fires on a guess.
3. **Clashes:** a detector over household-layer events only (on `calendar.changed` + the existing sweep), `collisions` dedupe, Muse Spark picks one fix, Muse Wonder words it, a `proposals` row + a `proposal` card in the Admin's thread from Hub; `proposals.*`; apply via the same path as `events.update`; tell the affected people (Coral tells Partner).
4. **Gift ideas:** trigger when a birthday is within `GIFTS.lookaheadDays` → card to adults (not the birthday person); `gifts.*`. Product ideas from the model now; real products arrive with web search in G4 (`url` stays empty until then).
5. **Homework:** `homework.*` (image via `files.uploadUrl` → `ctx.storage`, `HOMEWORK.maxPhotoBytes`), `practice.*`, summary note on finish, practice card to the kid and summary card to the parent.
6. **Chores:** `chores.*`, a chore reminder trigger (`chore.default` buttons, `notifications.choreId`, kid quiet hours apply), Done from push claims it, an approve card to adults.
7. **Routines:** `routines.*`, runs created at `ROUTINES.defaultTime` (or the routine's time) by the sweep, bedtime items from tomorrow's household events, a routine card to the kid.
8. **Mega Bucks and Store:** `bucks.*`, `store.*`, ownership checks in `megas.update` and `rooms.update`, a bucks card to the kid on release.
9. **Candidate sources:** add `chore`, `routine`, `proposal`, `shareSuggestion`, `practice`, `gifts` to `candidateSource` (`shared/domain/tables.ts`) together with the code that switches on them (internal only; log in the changelog).
10. **Evals (OpenDuet learning):** `evals/privacyGate/` and `evals/pushJudge/`: ~30 synthetic labeled cases each (JSONL; sensitive vs not, push vs statement vs drop), a script that runs the real gate/judge and writes precision/recall per model to a committed `results-<model>.md`. Spend: a few cents, inside the $5 cap; log it in STATUS.md.

## Frontend tasks (`src/`), board by board

- **Screen 9 · Sign in (Login, LoginSheet, LoginInvite, LoginScan, LoginPreview, LoginLocked, LoginFamily, LoginOpening):** restyle `welcome.tsx`, `invite.tsx`, `start.tsx`, `join/[token].tsx` to the boards: large "MEGA" wordmark, the only tagline "A little help for the whole family", sign-in sheet behind Make my MEGA / Sign in, the reusable walker layer (MEGAs on ledges, dip on press, say hi on tap, still under reduced motion; HQ reuses it in G5). QR scan stays designed-only (G8).
- **Screen 10 · Kids:** KidsSnap (camera/photo sheet → `files.uploadUrl` → `homework.submit`), Kids (homework card with For / Questions chips → `homework.makePractice`), KidsPractice / KidsHint / KidsDone (`practice.*`, 2-up big choices, "Hint, please"), KidsSummary (`practice.get` summary + stepper → `bucks.release`), KidsChore / KidsChoreApprove (`chores.*`, `bucks.release`), KidsBedtime / KidsMorning (`routines.*`), KidsBucks (bucks card, pixel coin, Open the Store).
- **Screen 11 · Store:** StoreRoom (Store button with balance in the kid's room), Store / StoreStickers / StoreColors / StoreAntennas / StoreEyes (tabs from `STORE_TABS`, `store.catalog`, live try-on on the kid's MEGA via the sprite renderer with `antenna` / `eyes` / `eyeColor`), StoreConfirm → `store.buy`, StoreBought → `megas.update`, StoreTray (bought furniture in Decorate → `rooms.update`).
- **Screen 12 · Calendar:** Calendar / CalPartner (week view, household + own private layer with lock and dashed bar, layer toggles; `calendar.range`), CalShare (`shareSuggestions.answer`), CalClash / CalClashDone / CalAfter (`proposals.get` / `.decide`, before/after, `PROPOSAL_DISCLOSURE`), CalGifts (`gifts.get`, "Based on what's shared" chips, `gifts.addToList`).
- Card renderers for the eight new card kinds (§3); unknown future kinds render nothing rather than crash.
- The sprite renderer in `src/` gains antenna / eye style / eye color (art from `prototypes/megasprite/mega-template.mjs`; the anime eyes are data, `ANIME_EYE`).

## Exit checks

All checks in STATUS.md, plus: the privacy grid has no skips and no stubs remain; the invariant tests above; a live run of the six-step clash scenario and the negative control on the cloud dev deployment with real Meta calls; a UX side-by-side of every Screen 9–12 board with the running app (web mobile viewport).
