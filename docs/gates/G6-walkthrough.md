> Current demo workflow: [Settings → Demo Console](../demo-console.md). The three-person live Gmail scenario and age-group policy in that guide supersede historical demo, seeded-reset, and sample-sign-in instructions below.

# G6 Task 1 · Web walkthrough (Oct 29)

Agent-run walkthrough of the demo script (docs/gates/G6.md) on Expo web (`localhost:19006`, never 8081) against the
dev deployment `colorless-ibis-289`, after `npx convex run seed:resetDemo` on the **Sample Family**
(`familyId n97bk26zhxfpa26mxtq6czgx0h8h6k7f`). Driven with the chrome-devtools MCP at 390×844 (phone) and
1440×900 (desktop). No fixes were made — this is the defect list only. Canvas v41 is the spec referenced below.

Screenshots: `/private/tmp/claude-501/-Users-brandonirving-products-mega/e6b210eb-54c9-45b9-9f4f-db2ca43ba9d7/scratchpad/g6-walk/`
(one screenshot — the Store wrong-item-name bug, #2 below — was accidentally deleted while tidying scratch files
mid-session; it's reproducible from the steps given and the bug was confirmed twice from both the live
accessibility snapshot and the source).

## Spend

Cap was $0.30. Checked `usage` before (`seed:resetDemo`) and after via the Convex `data` tool, diffed by
`_creationTime`. Two new rows for the Sample Family during this session:

| What | Cost |
|---|---|
| Reset/seed-time greeting generation | 1.22885¢ |
| Live reply to the kid chat-starter "Show me: Ready for tomorrow" (Twin 1 → Zap) | 2.130725¢ |
| **Total spent this session** | **≈3.36¢ (≈$0.034), 11% of the $0.30 cap** |

No other family's data was touched or mutated (the owner's live-Gmail "Brandon's family" was only read via the
Convex `data`/`tables` tools for comparison, never written to).

## What ran

- `seed:resetDemo` → fresh Sample Family (Admin, Partner, Twin 1, Twin 2, Toddler; MEGAs Hub/Teal/Coral/Zap/Sunny/Pebble).
- Signed in via the demo list as **Admin**, **Twin 2**, and **Twin 1** (sign out → demo list → pick; no password).
- Exercised: welcome/sign-in, Settings → Connected accounts, Family tab + member detail, HQ room, Invite/QR
  (web fallback), chat (gift ideas, clash-proposal Approve, chore → Mega Bucks release, milk ping, practice
  report), homework-photo sheet (web picker), Store purchase flow (Furniture + Eyes tabs), kid HQ "Your room" →
  Store, and two `clock.jump` calls (Thu 3:00 PM and Thu 8:00 PM ET) via `npx convex run clock:jump` with
  `--identity` set to the signed-in Admin's current `authId` (there is no UI or script wired to `clock.jump`;
  the Convex CLI's `--identity` flag was the only way to call it as an authenticated viewer — note for whoever
  owns this task next time).

## Summary verdict by beat

| Beat | Verdict | Notes |
|---|---|---|
| 0:00–0:15 Hook (widget) | ⚠️ | No web widget; nothing to check beyond the in-app "Leave by" card (see #6). Owner must verify the real widget on device. |
| 0:15–0:40 Everyone gets a MEGA (Invite/QR) | ✅ (web fallback) | QR + link + code render correctly on web; see #9 for a discoverability gap. |
| 0:40–1:05 It reads the mail | ⚠️ | Gmail shows the correct seeded **display-only** "Connected" state, but Sample Family's seeded mail data is just one item, not the script's "7 things." See #5. |
| 1:05–1:40 MEGAs coordinate (clash + negative control) | ✅ | Approve worked end to end, no crash; negative control (private dentist never flagged) held. |
| 1:40–2:10 Extra help for kids | ⚠️ | Chore → Mega Bucks → Store purchase works end to end, but found the Store confirmation-copy bug (#2). Homework web picker inconclusive via automation (#4). |
| 2:10–2:35 Proactive at the right moment | ⚠️ | Leave-by push, morning routine, chore reminder, bucks notice all fire correctly via `tickFamilyLogic`. Bedtime checklist data is correctly grounded server-side but wasn't auto-delivered in-session and the chat-starter's live answer wasn't grounded in it (#6). No weather/UV tip observed in this window. |
| 2:35–2:50 Gift ideas | ✅ | Price-watch chip, product cards, "I never buy anything" copy all present and correct. |
| 2:50–3:00 Close (Family HQ, every MEGA) | ✅ | All 6 MEGAs shown lined up at the Charger in HQ. Good visual. |

Also found, outside the script: tapping **your own card** in the Family tab (as Admin) **crashes the app** (#1) —
P0, not demo-script-specific but very easy to hit by accident during a recording or a judge poking around.

## Ranked defects

### P0 — blocks the demo

**1. Family tab: tapping your own member card crashes the app (uncaught error, no error boundary)**
- Beat: none specifically (reachable any time); Viewport: both (same code path)
- Steps: Sign in as Admin → Family tab → tap "Admin, Admin" (your own card)
- Expected: Opens your own member detail (or simply does nothing special)
- Actual: Full red error overlay: `Uncaught ConvexError: {"code":"FORBIDDEN","message":"FORBIDDEN"}` from
  `[CONVEX Q(family:kidThread)]`; app is stuck until reload
- Screenshot: `03-CRASH-admin-member-detail-phone.png`
- Root cause: `src/app/(tabs)/family/[memberId].tsx` calls `useKidThread(detail?.canReadChat ? id : null)`.
  `memberDetail`'s `canReadChat` is `true` whenever `target._id === viewer.member._id` (i.e. when you view
  *yourself*), so the kid-thread query fires for your own id. But `convex/family.ts`'s `kidThread` handler
  requires `viewer.isParentOf.includes(target._id)` — which is never true of yourself — so it throws
  `FORBIDDEN` instead of just skipping. Likely fix is either not setting `canReadChat` for self, or guarding the
  `useKidThread` call to kids only.
- Likely files: `convex/family.ts:92` (`kidThread`), `src/app/(tabs)/family/[memberId].tsx:22`, `src/data/useFamily.ts:19`.

### P1 — visible in the video / core beats

**2. Store "bought" confirmation can name the wrong item**
- Beat: 1:40–2:10 (Store); Viewport: phone (same bug applies at any width — code is shared)
- Steps: Sign in as a kid with some Mega Bucks → Store → a tab with more than one unowned item → **without
  tapping a tile first**, tap the bottom bar's default "Buy for N" button (pre-selected to the cheapest
  affordable/first unowned tile) → "Buy it"
- Expected: "It's yours! Find the **Plant** in Decorate…" (the item actually purchased)
- Actual: "It's yours! Find the **toy box** in Decorate…" — a different item than the one bought and charged for
  (balance correctly dropped 7 → 3 for the Plant; only the confirmation text is wrong)
- Screenshot: not retained (accidentally deleted mid-session); reproduced live and confirmed from the
  accessibility snapshot in this session, plus from source
- Root cause: `src/features/store/StoreScreen.tsx` — `selKey = picked[tab] ?? firstPick(tiles)` and
  `sel = tiles.find(t => t.key === selKey)` are recomputed on every render. If the kid never explicitly taps a
  tile (`picked[tab]` stays unset), `sel` keeps tracking `firstPick(tiles)` live. Once the purchased item flips
  to `owned`, `firstPick` re-picks the *next* unowned tile, and the "bought" sheet's body text
  (`fillCopy(STORE_COPY.boughtFurniture, { item: sel.label.toLowerCase() })`) reads that new `sel`, not the item
  that was actually passed to `onBuy`. Needs to snapshot the purchased tile at confirm-time instead of deriving
  it reactively.
- Likely file: `src/features/store/StoreScreen.tsx` (search `boughtFurniture`, `firstPick`, `SheetState`).

**3. Desktop layout: content pinned to one side with large dead space, chat column uncapped**
- Beat: several (chat, Invite/QR, HQ); Viewport: desktop 1440×900
- Chat: the message column runs the full ~1140 px of remaining width (not the recommended centered ~720 px),
  so cards/bubbles stretch edge-to-edge. Screenshots: `06-chat-admin-desktop.png`, `06b-chat-admin-desktop-recheck.png`.
- Invite/QR sheet and HQ room scene show the same pattern from the other direction: content is pinned to one
  side of the screen with a large unused region next to it, rather than being centered in the viewport.
  Screenshots: `05-invite-qr-desktop.png`, `11-hq-close-desktop.png`.
- This is the already-flagged "desktop chat width" item in G6.md (owner decision pending, recommended max
  ~720 px centered column) — confirmed still present, and the same pattern shows up on more than just chat.

**4. Homework web picker could not be verified via automated browser (needs a manual check)**
- Beat: 1:40–2:10 (homework); Viewport: phone and desktop
- Steps: Chat → "Snap homework" → web shows the still-worksheet frame with "Take the photo" / "Choose a photo
  instead" (correct web fallback per the code comment in `HomeworkSnap.tsx`) → tap "Choose a photo instead"
- Expected: OS file picker opens; selecting an image uploads it and a homework card appears
- Actual (in this automated session): no `<input type=file>` was ever created in the DOM (checked by patching
  `document.createElement`) and the chrome-devtools `upload_file` tool could not intercept a file chooser after
  clicking the button, in two separate attempts. No console errors were logged either.
- This may well be a CDP/headless-click limitation rather than a real app bug (`ImagePicker.launchImageLibraryAsync`
  on web is a thin wrapper around a native file input), but since this is the actual fallback a judge or a
  reviewer would hit on web, it needs a real human click-test before relying on it in review materials.
- Likely file: `src/features/kids/HomeworkSnap.tsx` (`HomeworkSnapPicker`).

**5. Mail beat can't be reproduced on the Sample Family used for this walkthrough**
- Beat: 0:40–1:05 ("It reads the mail so I don't have to"); Viewport: phone
- Settings → Connected accounts correctly shows Gmail "Connected as mega.demo.family@example.com" as a seeded,
  **display-only** connection (no live polling — confirmed in `shared/fixtures/sampleFamily.ts`'s `g5` comment:
  "no Google grant is seeded... nothing real is ever read"). The Sample Family's `mailItems` table has exactly
  one row ("Picture day", `decidedBy: "rule:seed"`), not the script's "7 things" (early dismissal, field trip +
  $12, game moved, water bill $48, …).
- That richer 7-item extraction already exists in this dev deployment, but only for the owner's own
  **"Brandon's family"**, which has a real live Gmail connection (per the task's hard rule, left untouched —
  only read via the Convex `data` tool for this comparison, never connected or synced here).
- Not a code bug — this is a scope gap in what `seed:resetDemo` seeds for Sample Family vs. what the script's
  narration describes. Owner should confirm on-device, with the real synthetic Gmail connected, that this beat
  looks the way the script describes.

**6. Bedtime "Ready for tomorrow" wasn't auto-delivered, and the chat-starter's answer isn't grounded in it**
- Beat: 2:10–2:35 (proactive) and 1:40–2:10 (bedtime tomorrow-prep); Viewport: phone
- After jumping the family clock to Thursday ~8:00 PM, the backend correctly created bedtime `routineRuns` for
  both twins, grounded in the real calendar (tonight is "Movie night"; items: Pajamas, Cozy blanket/Blanket,
  Favorite snack/Snack bag, Homework folder — `routineRuns` rows `pn74n0m6s8hc1g2vzabhf7dp9n8h7j27` /
  `pn79wx43b29txg74pj2p1txzsh8h6j27`). A matching "Ready for tomorrow?" push `candidate` was also created, but
  was still `status: "scheduled"` (not yet `"delivered"`) at last check — likely just waiting on the next cron
  tick rather than a bug, but it means the card never actually appeared as a chat message in this session.
- Separately, tapping the "Ready for tomorrow" **chat-starter** ("Show me") on Twin 1's chat triggered a real
  model reply (2.13¢, see Spend) that was **not grounded** in that checklist: it talked about "water bottle and
  shoes" (leftover from a different day's soccer-themed checklist) instead of tonight's actual Pajamas / Blanket
  / Snack items for Movie night.
- Recommend the owner verify (a) that the bedtime card reliably appears for a kid in the evening window on a
  real timeline, and (b) that the "Ready for tomorrow" chat-starter either grounds its answer in the real
  checklist or is replaced by actually showing the `BedtimeView` card.

### P2 — polish

**7. Sign out is still three taps deep, via a mislabeled row**
- Confirmed this is still the exact issue named in G6.md's "Polish already known" #2 (not fixed yet): Chat →
  MEGA badge → MEGA profile → **"Theme"** row (which doesn't open a theme picker — it opens the entire Settings
  screen) → scroll to the very bottom → Sign out.
- Settings is reachable directly in one tap from elsewhere (e.g. its own URL), and Sign out sits right at the
  bottom of that one screen — the gap is that MEGA profile has no direct "Settings" row of its own, only the
  oddly-labeled "Theme" row that happens to lead there.
- Likely file: `src/app/mega-profile/index.tsx` (or wherever the profile's "YOU" section buttons are defined).

**8. Bedtime title: "4:30 PM" vs. the board's "4:30"**
- Confirmed in code/tests, not independently re-observed live (no event-anchored bedtime card rendered with a
  time in this session — see #6). `src/features/kids/RoutineCard.tsx`'s `bedtimeTitle()` fills
  `KIDS_COPY.bedtimeTitleEventAt` ("{event} tomorrow at {time}") with `formatLocalTime`, producing e.g. "Soccer
  practice tomorrow at 4:30 PM" (see `src/features/kids/KidsCards.test.tsx:179`). This is the already-known open
  owner decision in STATUS.md ("bedtime title shows '4:30 PM' vs the board's '4:30'") — confirmed still present.

**9. Family tab has no visible "Invite" affordance**
- Beat: 0:15–0:40 ("Everyone gets a MEGA"); Viewport: phone
- The Family tab lists members but has no top-level "Invite"/"Add a member" button. The only path to the
  invite/QR screen is: tap a **not-yet-joined** member's own card (e.g. Toddler) → "Invite" section → "Show QR
  code and link". HQ's "Mailbox" and "Front door" furniture are red herrings here — they just show tooltips
  ("MEGAs pass messages to each other here" / "MEGAs head out here for errands"), not an invite flow.
- Minor discoverability gap for the very first beat of the demo; worth a quick HQ/Family affordance if time
  allows, otherwise just make sure whoever drives the recording knows the path.

**10. Product-card skeleton flash on first paint**
- Beat: 2:35–2:50 (gift ideas); Viewport: desktop
- On first navigation into chat, two product sub-cards under "Soccer ball with their name on it" briefly
  rendered as gray skeleton placeholders (image box + two gray bars) before the real image/price/store text
  appeared a few seconds later (compare `06-chat-admin-desktop.png` vs. `06b-chat-admin-desktop-recheck.png`; no
  console errors either time). Likely a normal image/data load race, not a logic bug, but could read as a
  flicker if the camera lingers on first load in the recorded take.

## Owner-on-device checklist (iPhone-only parts, build `cd4140e3`)

- **QR camera scan:** web fallback (QR image + raw link/code + Copy/Send buttons) renders correctly; the actual
  camera-based scan on a second phone needs a real-device test.
- **Lock-screen push:** nothing to see on web; the closest analog, the in-app "Leave by X for Soccer pickup"
  card, fired correctly here after a clock jump. Confirm it actually reaches the iPhone lock screen with the
  described buttons ("On my way" / "Snooze 5 min").
- **Home screen widget:** nothing to check on web at all — verify `MegaNext` on device per G8.
- **Homework live camera viewfinder + the "Choose a photo instead" web fallback (#4):** verify both — the live
  camera on device, and that the web fallback's file picker genuinely opens for a human click (this walkthrough
  could not confirm it under browser automation).
- **Gmail "I found 7 things" extraction (#5):** only testable with the real synthetic Gmail connected, which is
  out of scope for this synthetic-data-only web walkthrough. Verify per G6.md's demo-setup steps 1–3.
- **Store confirmation-copy bug (#2):** same shared frontend code runs on device, so almost certainly
  reproducible there too — decide fix priority before recording a take that shows the Store.
- **Bedtime checklist timing (#6):** verify the card/push reliably appears for a kid in the evening window on a
  real timeline (not just that the backend data is correct), and that any free-chat answer about "tonight" stays
  grounded in the kid's actual checklist.
