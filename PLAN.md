# MEGA — My Everyday Guidance Agent

A proactive AI for the whole family. Each family member gets their own MEGA. All MEGAs share family context within privacy scopes, coordinate with each other, and reach people mostly through push notifications.

- **Hackathon:** Meta Global AI Developer Hackathon. Remote. Build Oct 26 – Nov 4 2026, submissions due Nov 4 at 9 PM ET. Theme: "Build for Your World". Indie track.
- **Required models:** Meta models via Meta Model API (Muse Spark, Muse Image, SAM 3.1) or Meta open weights.
- **Platform:** web and mobile from one Expo codebase; iPhone is the first device tested.
- **Identity (Oct 26):** name **MEGA** (My Everyday Guidance Agent). Tagline **"Your family's AI assistants"**. iOS bundle ID / Android package `com.megafamily.app`; Apple Services ID (web sign-in) `com.megafamily.app.web`; deep-link scheme `mega`. These live in the app config, not in secrets.
- **Design reference:** the `*.png` mockups in this folder. Layout and components are the reference; the changes in [Design](#design) take precedence.

---

## Coding principles

From the user profile (`~/.claude/CLAUDE.md`), applied here:

- **Config and adapter driven.** Meta Model API, Expo Push and Convex are implementation details behind interfaces the app defines. Feature code never imports a vendor SDK.
- **Change behavior through config.** Models, prompts, limits, schedules, themes and copy live in `shared/config`.
- **Single source of truth, DRY.** Types, schemas, design tokens and constants are defined once in `shared/` and imported by both the app and the backend.
- **Modular, low coupling, high cohesion.** Each feature module owns its data and exposes a small interface.

---

## Product

### MEGAs
- One **family MEGA** (the coordinator) plus one MEGA per member. Babies and toddlers get a *care MEGA*, which parents use to keep track of the child; the child never talks to it.
- Each MEGA has a name, a look (a code-drawn sprite: shell color + decal), a personality, tools, privacy scopes, and limits on how many messages it can send unprompted.
- **Addressing a MEGA:**
  1. Type `@` to get a list of the family's MEGAs.
  2. Spoken messages are checked for names that sound like a MEGA. A loose match against the family's MEGA names runs first; the model is asked only when the match is uncertain.
  3. Open a MEGA in **HQ** and tap **Talk**.

### Memory scopes (enforced in queries, never only in prompts)
| Scope | Readable by |
|---|---|
| `family` | Every MEGA |
| `adults` | Admin and adult members' MEGAs |
| `personal` | Only the owner's MEGA |
| `shared` | Whoever the owner grants it to |

Safety escalation for kids follows rules the kids can see, set per member in config.

### Proactive engine
`trigger → draft → judge → wait for right time → deliver (push) → record reaction`
- **Triggers:** something one person said that matters to another person's MEGA, a recurring check-in for each MEGA, dates and milestones.
- **Judge:** Muse Spark decides whether a message is worth interrupting for.
- **Limits per member:** daily message cap, quiet hours, and 👍/👎 feedback that tunes future messages.
- **Clock:** every trigger takes `now` as an input, so a simulated clock (for the demo and tests) runs the same code as production.
- **Push notifications** carry action buttons, for example "Remind me at 4:50" or "I'll handle it".

---

## Frontend

Planned one screen at a time: agree on the layout, then mock it up, get feedback, iterate. Reference images in `concepts/` (newest) and the repo root are inspiration, not requirements.

### Platforms
**Web, iOS and Android from one Expo codebase** (Expo Router). Per the current Expo docs, tabs use the system tab bar on iOS and Android (native tabs) and custom tabs from `expo-router/ui` on web, chosen through platform-specific files (`app-tabs.native.tsx` / `app-tabs.tsx`). On wide web screens the tab bar becomes a left sidebar, as in the desktop mockups.

### One app, three levels
Every member gets the same screens; higher levels add controls. What each level sees is config.

| | Kid | Adult | Admin |
|---|---|---|---|
| Tabs | Chat · HQ | Chat · HQ · Family | Chat · HQ · Family |
| Main input | Talk mode, reply buttons | Chat and cards | Chat and cards |
| MEGA profile | Color and decal | + personality, what it shares | + memory, rules, limits, activity log |

- **Lab is not a tab.** It's the MEGA profile, opened by tapping the badge.
- Anything doable by tapping is also doable by asking the MEGA in chat.

### Visual direction
- **Dark by default:** a near-black background with the member's MEGA shell color as the accent.
- **Theme and styling are config, never hardcoded in components.** Colors, type scale, spacing, radii, shadows, touch-target sizes and animation timings are tokens in `config/theme.ts`; presets (Midnight default, Daylight) and per-level overrides (Kid: larger type and targets) are token sets. Components read tokens only, and the accent is derived from the member's MEGA shell color.
- **Chat wallpaper:** a device photo or a preset, with an adjustable dark overlay so messages stay readable.
- **The MEGA is the code-drawn sprite everywhere:** the badge (head on a white tile) in headers and messages, and the full sprite in HQ.

### UX quality bar (owner priority, Oct 26)
The frontend is the product: it must feel **smooth, responsive and intuitive**. Every gate checks:
- **Keyboard:** inputs (composer, blocks, sheets) stay above the keyboard with interactive dismiss; the thread keeps the newest message in view.
- **Transitions:** Reanimated entering/exiting/layout animations for messages, blocks collapsing into answers, sheets and talk-mode states; timings from theme duration tokens; reduced motion respected.
- **No flicker:** keep the last data while queries refetch, skeletons shaped like the content, no flash of loading/welcome screens, stable keys, optimistic sends replaced in place, streaming text grows without re-laying-out the list.
- **Responsive:** instant press feedback (pressed state, haptics), 60fps lists, fixed sizes so nothing shifts when images or sprites load.
- **Checked by:** a dedicated UX reviewer at every gate (web recordings checked frame by frame for flashes and layout jumps, plus a device pass by the owner).

### Screen order
1. Chat (+ talk mode) 2. HQ 3. MEGA profile 4. Family 5. Create a MEGA / first launch 6. Push notification → app 7. Settings (theme, wallpaper) 8. Widgets

### 1. Chat (decided Oct 24)
- **Private by default:** each member talks with their own MEGA. Other MEGAs join when @'d. A family group chat may come later.
- **Header:** the animated badge, the MEGA's name, and a live status line ("At the desk · Math homework", from the same job event that drives HQ). On the right, a **Today** button with a count of things waiting on you; it opens a view of today's events, decisions and lists.
- **The thread holds only the conversation:** messages, reply buttons on questions, and result cards created by the chat. Each result card shows who can see it.
- **No persistent non-chat items.** Things not from the chat (a reminder firing, a request from another MEGA) drop down from the header as a card when triggered, with action buttons, then dismiss on their own; the Today view keeps them.
- **Greeting:** on the first open in the morning or at night, the badge grows to the middle of the screen, blinks and says "Good morning, Brandon!" with its voice meter, then shrinks back into the header (about 2 seconds). No generated greeting scenes.
- **Composer:** `+` (attach), text field ("Message Teal…", `@` lists MEGAs), mic. **The mic only opens talk mode**; there is no separate voice note.
- **Kid version:** same screen, larger targets, reply buttons on every question, less text per message, a big "Talk to Zap" button with a small keyboard button.
- **MEGA messages have no bubble;** the badge beside them shows who is talking. Only your own messages are bubbles.
- **Kid wins take over the screen:** a correct quiz answer or finished task makes the MEGA grow full screen (happy face, bounce, burst of stars; no streaks or counters, decided Oct 26), then shrink back into the badge, like the greeting. Wrong answers stay in the chat with a gentle hint and another try.
- **The adult composer keeps the small mic;** the big talk button is the kid default (config per level).

### Talk mode (decided Oct 24)
A full-screen walkie-talkie, so there's no guessing when someone has finished talking.
- The MEGA's head is shown large: eyes wide while listening, antenna pulsing while thinking, voice meter while talking.
- **Hold to talk, release to send.** Your words appear live while you hold; the MEGA's reply shows as large captions. A chirp and a haptic tap mark the start and end of each turn.
- Pressing while the MEGA talks interrupts it. **Slide up to lock** for long messages, tap to send.
- ✕ or swipe down to leave. Everything is already saved to the chat thread.
- **Spoken replies come later.** The first version shows the reply as text; a text-to-speech service gets added behind a `Speaker` port when ready (not a Meta model, so it's a config choice).

### 2. HQ (decided Oct 25)
- **Two kinds of room.** **HQ** is the shared family room where every MEGA works. Each member also has **their own room**, reached through their door in HQ or the **My room** button in the header. Kids can decorate their room (furniture, rug, wall color, posters, placed on the grid).
- **Look:** top-down tile room like Game Boy / GBA Pokémon, drawn in code from tile and furniture data (same pixel engine as the MEGA). The room fits the screen width; on a wide web screen it stays centered at its pixel scale.
- **MEGAs walk scripted routes** to the station for their current job and stand facing it (no sitting pose). Emote bubbles show "!", "…", "♪".
- **Stations** (config): desk = homework and work, calendar wall = scheduling, fridge = groceries and meals, mailbox = messages, bookshelf = looking things up, toy rug = kid activities, charger = idle and night, front door = away on an errand.
- **Pokémon-style text box** under the room narrates the latest event. Tapping a MEGA switches it to that MEGA with **Talk** and **Details**.
- **Privacy:** you see where another member's MEGA is ("Coral is at the calendar") but its task shows as "Busy" unless that member shares it.
- **Stations are tappable:** fridge opens the grocery list, calendar opens Today, desk shows that MEGA's current work, mailbox shows messages, a member's door opens their room.
- **Own rooms (decided Oct 25):**
  - Open to the whole family for now; no knocking.
  - **Only the owner decorates their room;** HQ's layout is fixed.
  - **Every furniture item is available from the start, and each can be recolored.** No unlocks, currency or rewards: game mechanics belong to **Mega Pets**, a separate game of the user's that may get an integration later.
  - **Posters are made with Muse Image:** the owner describes one, it's generated in pixel style, and tapping a poster on the wall shows the full image.
  - Furniture carries its own station (a desk's station is the tile in front of it), so the MEGA's routes follow the furniture wherever it's placed.

### 3. MEGA profile (decided Oct 25)
- Opens from the badge (chat header, or **Details** in HQ) as a full-screen sheet. It only ever shows **your own** MEGA; parents' controls for kids' MEGAs live in the Family tab.
- **Top:** the full sprite, the name with a rename button (adults only), and the live status line.
- **Look and personality** is one button that opens its own screen (no floating animation; the MEGA blinks):
  - **Color:** six presets plus a **custom color picker** (any hex). The shell's light and dark shades are derived from the one color.
  - **Sticker** (replaces the 3×3 decal, Oct 25): a small sticker image made by Muse Image, placed on the top-right of the head. We start with **4 preset stickers**; no custom stickers yet.
  - **Personality (everyone, kids included):** Calm, Cheerful, Funny, Brief. A preset sets the MEGA's **resting face** (shown in the badge everywhere) and its **speech pattern** (prompt config). A sample line previews how it talks. No free-text field.
- **What it shares (adults):** Schedule, Lists, HQ activity, each set to Only me, Partner or Family.
- **Admin only:** What it remembers (search and delete), Rules and limits (quiet hours, push limits), Activity log.
- **Kids:** can change the look and personality, but can't rename and don't get sharing or memory.

### 4. Family (decided Oct 25)
Adults and admins only.
- **Members list:** each member with their MEGA's badge, role (Admin, Adult, Kid) and what their MEGA is doing. **The admin creates MEGAs and assigns them to members**; a member without a MEGA (for example a toddler) is shown by name only.
- **Tap a member:** Message (their MEGA joins your chat), Visit room, and for kids, **Kid controls** (parents only): homework mode (hints, not answers), quiet hours and bedtime, daily time limit, blocked topics, what the kid's MEGA tells parents, and **parents can read chats** (on by default, decided Oct 26).
- **Family calendar:** a calendar button in the header opens the full calendar (week strip and day agenda, color-coded by member). Under the members list, **Coming up** shows events in the next 2 hours, or "No events in the next 2 hours".
- **Voting is out for now** (Oct 25): there was no UI for starting a vote. Revisit later.
- **Shared:** full family Calendar and Lists live here; the Today sheet keeps just today.

### 5. Onboarding and first launch (decided Oct 25)
- **The admin's own MEGA comes first and is required.** From that moment the MEGA guides the rest of setup in a chat, with cards for the structured parts. **Voice mode (hold to talk) works throughout onboarding.**
- **Conversation, not forms (Oct 25).** Adding people happens in the chat with your MEGA: "Who should I add first?" → "Who is Anela to you?" → "Should they get a MEGA?" When the MEGA needs something structured, it drops a small piece of UI into the thread (see **Thread UI blocks** under Architecture) instead of opening a form.
- **Admin flow:** Welcome → make your MEGA (look, sticker, personality, name) → chat: your MEGA's get-to-know-you questions → "Who should I add first?" (name) → **relationship** ("Who is Anela to you?": Daughter, Son, Child, Partner, Parent, something else) → "Should they get a MEGA?" (not yet for someone like a toddler) → optional details block (birthday, grade, activities) → look block for their MEGA (they can change it later) → questions block → invite card → "Add someone else" or "That's everyone".
- **Later additions use the same chat:** Family → **Add a family member** opens your MEGA's chat at "Who should I add?"; there is no separate form.
- **Relationships are stored** between members ("Anela is Brandon's daughter"), are captured in conversation, and are used in how MEGAs talk ("your daughter") and in permissions (a parent of a kid gets that kid's controls).
- **Questions:** the admin's MEGA drafts the question set straight away and suggests additions. Each question can carry a **default from what the admin entered**, phrased as a confirmation ("Is it OK if I call you Anela?"); questions without a default are asked open. The admin can toggle and add questions.
- **Joining:** a **QR code** for people in the room, or an **invite link** for anyone not nearby (adults and kids alike).
- **Kids can join on their own** but must enter the **5-digit parent code** that only parents have.
- **Member's first launch:** the MEGA greets them and runs the get-to-know-you chat (confirmations first, then open questions), by voice or text, then lands in chat.

### 6. Push notification → app (decided Oct 25)
- **Loud vs quiet:** reminders and requests wake the phone (iOS `interruptionLevel` `time-sensitive` for reminders, `active` for requests; an Android channel with high importance). Tips and kid updates arrive silently (iOS `passive`; a low-importance Android channel) and group as "N quiet updates from Teal". Which kind is loud is config.
- **Quick buttons on the notification:** long-press shows the buttons; answering doesn't open the app, and the lock screen shows the MEGA's reply ("Told Coral you'll grab it"). The button sets for each kind are still to be decided; the mockup uses placeholders (Yes / I can't, On my way / Snooze 5 min). They are the same as the thread **choice block**, so an answer from the lock screen and one in the chat are recorded the same way. Built as notification categories with actions (`setNotificationCategoryAsync`, `opensAppToForeground: false`). Risk: check on day 3 that an answer is recorded when the app has been killed (Expo's docs say response listeners don't fire then, so record it through a background task or the server).
- **Tapping the notification** opens your MEGA's chat at that message ("From a notification · 2m ago") with the same buttons in the thread.
- **Kids' phones get reminders only**, with bigger buttons, never during quiet hours. Anything due during quiet hours is held and sent when they end ("Saved from 9:10 PM · quiet hours").

### 7. Settings (decided Oct 25)
- **Everyone:** Look (theme and wallpaper). **Adults:** their own notification settings (what wakes the phone, quiet hours, daily limit). **Admin only:** a Family section (members and MEGAs, parent code, invite, default kid controls). **Kids** see their quiet hours, time limit and "Your parents can read your chats" as read-only ("Set by a parent").
- **Theme:** Midnight (dark) by default, plus Light. The accent color is either the theme's default or **Match my MEGA**, which follows the MEGA's color if it changes. **Everyone except the admin gets Match my MEGA by default.** The theme sheet shows a live preview.
- **The admin's theme is offered while making their MEGA:** right after the MEGA says hello, it asks "Want the whole app in my color?" with a **Preview** toggle that recolors the chat live, then "Use Teal's color" or "Keep Midnight". It's skipped when the MEGA is already Midnight teal.
- **Wallpaper:** presets drawn in code (MEGA glow, Night, Dawn, My room), a family photo, or **Make one** (adults only: opens the MEGA's chat to describe it, and Muse Image draws it). **Kids can't generate wallpapers for now**; maybe 13 and up later (a config age threshold).
- Theme tokens live in `config/theme.ts` (the mockups share them as `themes.js`).

### 8. Widgets (decided Oct 25)
- **Small:** your MEGA's face, the next thing coming up (or its statement) and a **Talk** button. **Medium:** "Coming up · next 2 hours", color-coded by person, with a mic button. **Lock screen:** a rectangular widget with the next item and a round **Talk** widget.
- **Priority:** events in the next 2 hours come first. If there are none, the widget shows the MEGA's **top proactive statement** ("Recycling goes out Tuesday. Want a reminder Monday night?"): the best-scored item the judge kept back from a push. So the widget is where non-urgent proactive messages show up.
- **Talk:** a widget can't use the microphone, so you can't talk from the widget itself. The Talk button deep-links to talk mode (`mega://talk`), which opens already listening. Later: an iOS Control (Control Center, lock screen, Action button) and a Siri phrase that do the same.
- **Tapping a widget** opens the chat at that item. Answer buttons on the widget itself are a later option.
- **Kids get widgets too:** their MEGA, only events that involve them, bigger text.
- Built with `expo-widgets` (`createWidget`, `updateTimeline` with entries for future times; families `systemSmall`, `systemMedium`, `accessoryRectangular`, `accessoryCircular`). Android widgets are behind `enableAndroid`, and `updateTimeline` is iOS-only, so check Android support on build day.

---

## Architecture

```
shared/                      ← single source of truth (imported by app and backend)
  config/                    identity, theme, looks, models, notifications (button sets), limits, learning policy, kid safety, roles
  domain/                    the contract as Convex validators: enums, tables, messages (UI blocks, cards), api (every function's args/returns)
  fixtures/                  the sample family (generic labels)
  time.ts                    timezone helpers (Intl only)

convex/                      ← backend
  schema.ts                  tables from shared/domain/tables + indexes
  model/                     domain logic (scopes, …)
  adapters/                  metaModelApi, expoPush, … behind ports (from G1)
  seed.ts                    the sample family

src/app/                     ← Expo Router screens (template layout: routes live in src/app)
src/                         ui/, features/, services/ (from G1)
tests/                       cross-cutting tests (contract.test.ts checks CONTRACT.md ↔ code)
scripts/                     secrets.mjs (uses .env.secrets without showing values), smoke/meta.mjs
```

### Thread UI blocks (agent-generated UI)
MEGAs can put small interactive pieces of UI into the message thread when a conversation needs structured input or a decision, so the app rarely needs forms.
- **Catalog, not free-form:** the agent calls a `show_ui` tool with a block spec. The spec is validated against shared schemas (`shared/domain/uiBlocks`), and the app renders it from a fixed component catalog: `choice` (single or multi, as chips), `toggle`, `text`, `number`, `date`, `fields` (a few optional inputs with Skip), `look` (MEGA look picker), `questions` (toggle list), `invite` (QR and link), `confirm` (a summary with Confirm / Change) and the existing result and reminder cards.
- **Answers come back as structured messages**, shown in the thread as a plain reply bubble ("Child", "Skipped", "Sunny · Sun · Leaf · Cheerful"). The block then collapses, so the thread reads like a conversation.
- **Voice can answer any block:** "Hold to talk" fills it from speech, with the block as the parsing target.
- **Per user:** kids get bigger targets and fewer options per block (level config). Which blocks a MEGA may use, and their limits, are config.

**Rules**
- `convex/modules/*` depend only on `shared/ports`. `adapters/registry.ts` is the only file that knows which vendor fills each port.
- Changing a model, for example the Muse Spark version or the image provider, is a config edit.
- The app talks only to Convex; it never calls vendors directly.

### Role → model (default config)
| Role | Port | Default adapter / model |
|---|---|---|
| Chat, tool calls, judge | `ChatModel` | Meta Model API · Muse Spark |
| MEGA avatar | none | Drawn in code (`shared/sprite`) |
| Scenes (wallpapers, memes, room posters, MEGA stickers) | `ImageGenerator` | Meta Model API · Muse Image |
| Photo understanding (photos shared in chat, wallpaper subjects) | `Segmenter` | SAM 3.1 |
| Speech to text | `Transcriber` | Meta Model API · Muse Voice Transcribe (fallback: Muse Spark 1.2 audio input). Smoke test on day 1. |
| Text to speech | `Speaker` | On-device (`expo-speech`); Meta has no TTS model |
| Web search | `WebSearch` | Muse Spark built-in `web_search` tool (with citations); Tavily adapter off in config (all-Meta for now) |
| Memory lookup | `MemoryIndex` | Convex full-text search (no embeddings; see Backend → Memory) |
| Weather | `Weather` | Open-Meteo forecast + NWS alerts (US) |
| Travel time | `Directions` | Mapbox Directions `driving-traffic` |
| Calendar feeds | `CalendarFeed` | ICS subscriptions (`node-ical`); device calendar import via `expo-calendar` |
| Push | `PushSender` | Expo Push API (`@convex-dev/expo-push-notifications`) |
| Time | `Clock` | System clock in production; a simulated clock for each family in the demo and tests |

---

## Backend (planned Oct 25)

Facts in this section come from the current docs (Oct 25): the Meta Model API docs and the hackathon page, Convex docs and components, Expo docs. Items marked **(verify)** couldn't be confirmed and get a smoke test on day 1.

### How it fits together
Everything that happens becomes an **event** in a family's log (`said`, `calendar.changed`, `list.changed`, `reminder.due`, `weather.alert`, `notification.answered`, `clock.tick`). Small processors react to events:

```
message / sync / clock tick ─► events ─┬─► memory writer   (facts in, with a scope)
                                        ├─► profiler        (updates member profiles)
                                        └─► trigger matcher ─► candidates ─► proactive pipeline ─► push / widget / Today
```

- **One agent loop, many MEGAs.** Every MEGA runs the same loop. What differs is config: personality, the member it belongs to, readable scopes, allowed tools, limits. The family MEGA is the same loop with the coordinator role (calendar clashes, shared lists, requests no one picked up).
- **Our own thin loop instead of `@convex-dev/agent`.** The Agent component wants an embedding model for memory, and wiring Muse Spark into it is unconfirmed. We already own scopes and memory. The loop: build context → `ChatModel.chat({messages, tools, schema})` → run the tool calls → repeat (at most N steps, set in config) → stream the reply. Streaming uses `@convex-dev/persistent-text-streaming`.
- **Meta Model API:** OpenAI-compatible at `https://api.meta.ai/v1` (Responses and Chat Completions), called with the OpenAI SDK pointed at that base URL, only inside `adapters/metaModelApi`. Model `muse-spark-1.3` (1M-token context, prompt caching). The model ID is config. Tool calling and JSON-schema output are reported by provider docs **(verify)**.

### Global memory
**What a memory is:** one row in `memories`:

| Field | Purpose |
|---|---|
| `familyId`, `scope`, `scopeKey` | `scope` ∈ family / adults / personal / shared. `scopeKey` is one string (`fam:family`, `fam:adults`, `fam:personal:<memberId>`, `fam:shared:<grantId>`) because Convex search filters only match exact values (no AND) |
| `about` | member ids the fact is about (can be empty for household facts) |
| `kind` | fact · preference · routine · plan · relationship · place · note |
| `text` + `data` | a readable sentence plus structured fields (for example a routine's days and time) |
| `source` | message id, integration, onboarding answer or the admin |
| `confidence`, `confirmed` | low-confidence facts become a "check" question later |
| `validUntil`, `supersedes` | plans expire; updates replace instead of piling up |
| `sensitive` | health, feelings, money, school trouble: never widened automatically |

**Enforcement (rule: in queries, never only in prompts):** one function, `readableScopeKeys(viewer)`, returns the keys a MEGA may read: family, adults (adults only), its own personal key, and shared grants. Every read goes through `memory.recall(ctx, viewer, query)`, which searches each readable key and merges the results (Convex text search takes one exact filter value per search, so it runs one search per key, which is usually 3–5). There is no other read path, and tool handlers get the viewer from the server, never from the model.

**Writing:** after each turn, the **memory writer** (Muse Spark, structured output) proposes `add / update / expire` operations, each with a suggested scope.
- Defaults: logistics (events, lists, pickups) → family. Things a person says about themselves → personal. Anything that would be useful to someone else but is personal → **ask first**: the MEGA drops a choice block ("Want me to tell Coral you're running late?").
- `sensitive` facts stay personal unless the owner says otherwise. For kids, safety concerns follow the kid controls ("what the MEGA tells parents"), and the rules are visible to the kid.

**Finding memories without embeddings.** The Meta Model API has no embedding model, and there's no Meta open-weight text embedding model, so we don't use vector search to start. A family's memory is small, and Muse Spark has a 1M-token context with cheap cached input. Each turn's context is:
1. the member's **profile card** (always included and cached)
2. **pinned family facts** (household basics, a short list)
3. **text-search hits** for the message, across readable scopes
4. the **next 7 days** of events, open reminders and lists
5. the recent thread
6. a `recall` tool so the model can look further itself

**Decided Oct 25: start all-Meta, text search only.** Everything sits behind a `MemoryIndex` port, so a vector adapter can be added later if the rules allow non-Meta embeddings.

**Forgetting:** "What it remembers" (admin) and "What do you know about me?" (anyone, in chat) list memories and delete them. Plans expire on their own.

### Profiling
- **Profile per member** (`profiles`):
  - basics: what to call them, relationships, birthday, grade or work, activities
  - preferences: reminder times, tone, what wakes the phone
  - learned routines ("soccer Mon and Wed at 6")
  - places (home, school, work: only if given, used for travel time)
  - kid controls
- **Seeded by onboarding:** the admin's answers, then the member confirms them in the get-to-know-you chat.
- **Grows over time:** a nightly **profiler** job (cron) turns the day's memories into profile updates. Confident ones are applied. Uncertain ones become **check questions** the MEGA asks naturally later, as a choice block: "Is soccer still Mondays and Wednesdays?"
- **Learns from reactions:** 👍/👎, button answers and ignored notifications update per-kind weights in `profiles.proactive` (simple counts). The judge reads them, so a family that ignores tips gets fewer tips.
- **Limits:** no guessing at sensitive traits, nothing hidden (everything in a profile can be shown to its owner), and kids' profiles hold only what's needed for reminders, homework mode and safety.

### Learnings (planned Oct 25)
A **learning** is anything MEGA keeps after a conversation ends. It's not a separate store: learnings are rows in `memories` (facts, routines, preferences, how to behave) plus the reaction counts in `profiles.proactive`. What's new here is the **policy**: when something is saved, at what level, and how sure MEGA has to be.

**Levels** (who can read it; these are the memory scopes):

| Level | Readable by | Typical learnings |
|---|---|---|
| Moment | only the current thread, never saved | "I'm wiped today", one-off moods, anything said while the topic is in progress |
| Personal | the member and their own MEGA | their preferences, their routines, how they like MEGA to talk, things they say about others in private |
| Shared | the member plus the people in a grant | "Tell Coral when I'm running late" |
| Adults | both adults' MEGAs | money, plans for the kids, adult-only logistics |
| Family | every MEGA, including the family MEGA | events, pickups, lists, household facts ("trash goes out Tuesday night") |

There's **no level above the family:** nothing one family teaches MEGA reaches another family. Changing behavior for everyone happens in config, by us.

**How MEGA should behave** is also a learning: kind `style` at the personal level ("shorter replies", "no reminders before 8 AM", "call me Bee"). The loop reads it as part of the profile card.

**When something is saved** (one policy table in config, `learningPolicy`, keyed by trigger × kind):

| Trigger | Example | Saved | Confirmed? |
|---|---|---|---|
| **Explicit** | "Remember that…", "From now on…" | right away | yes |
| **Correction** | "No, soccer moved to Tuesdays" | right away; replaces the old one (`supersedes`) | yes |
| **Stated in passing** | "We're out of milk", "Dentist is Thursday at 3" | right after the turn, if clear and not sensitive | no: used, and shown with a chip so it can be fixed |
| **Pattern** | Asks for the soccer reminder three Mondays in a row | only after N sightings in a window (config, default 3 in 21 days), by the nightly profiler | no, until the member answers a check question |
| **Reaction** | Ignores five morning tips | counts update right away; a `style` learning only past a threshold, and MEGA says so ("I'll send fewer morning tips. Want them back?") | no |
| **Never** | web results, another member's private chat, guesses about health, feelings or school trouble, kids' traits | not saved | — |

Sensitive things are saved only when the member says so, and always at the personal level.

**Where it shows up:** each save adds a small chip under the message (`Saved · Family`). Tapping it lets you change the level or forget it. "What do you know about me?" and the profile list everything, grouped by level.

**Confidence over time:**
- Confirming or reusing a learning raises its confidence.
- Unconfirmed, inferred learnings fade (a half-life in config) and expire below a floor.
- A routine that stops happening gets a check question ("Is soccer still on Mondays?").

**Conflicts:** two members say different things at the family level (pickup at 5 vs 5:30). The family MEGA keeps both, marks the conflict and asks the event's owner, as a choice block.

**Kids:**
- A kid's personal learnings stay with the kid's MEGA.
- Logistics go to the family level as usual.
- Safety concerns follow the kid controls ("what the kid's MEGA tells parents"), and the kid can see those rules.
- **Parents can read their kids' chats** (decided Oct 26; the user is torn, so it's a kid control, `parentsCanReadChat`, default on, set per kid). Parents read them on the kid's member page (Family → kid → Chats), not through their own MEGA.
  - **The kid is told:** a line at the top of the kid's chat and in their Settings: "Your parents can read this chat." There's no hidden monitoring.
  - **Reading isn't recall:** a parent's MEGA still can't search the kid's personal memories. Only the parent, looking at the chat, sees them. That keeps scopes simple, and turning the control off later doesn't leave copies behind in adult memories.
  - Parents also see the kid's profile (basics, routines, controls).
- The toddler's care MEGA is run by parents, so its learnings are at the adults level.

**How it's built:** the memory writer's output schema has `trigger`, `kind` and a suggested `level` for each operation. One function, `applyLearningPolicy`, looks the pair up in `learningPolicy` and decides: save now, save unconfirmed, queue for the profiler, ask before sharing, or drop. The writer only *proposes*, and the policy is the single place that decides, so tuning it is a config edit.

### Proactive engine
Durable pipeline built with `@convex-dev/workflow` (steps, `step.sleep`, retries). `@convex-dev/workpool` caps how many model calls run at once, and `@convex-dev/rate-limiter` caps spend per family per day (config).

1. **Trigger → candidate.** Sources:
   - **cross-member:** the memory writer marks "matters to Teal" (partner: "we're out of milk" → a request to the admin)
   - **time:** event reminders, "leave by" from travel time, birthdays and milestones, learned routines
   - **check-ins:** a daily greeting per member at their preferred time (cron)
   - **integrations:** weather alerts, changes in an ICS feed
   - **MEGA-to-MEGA requests:** the `requests` table (Coral asks Teal), which also drives the "Coral asks…" cards

   Every candidate has a `dedupeKey`, so the same thing isn't proposed twice.
2. **Draft.** Muse Spark writes it in the recipient MEGA's voice and picks a **kind** (reminder · request · tip · update) and the button set for that kind (config), plus a delivery window.
3. **Judge.** Muse Spark returns a structured score and reason, given the candidate, the profile, today's sent count and recent reactions. Each kind has thresholds in config:
   - above `push` → push
   - between `widget` and `push` → the widget, Today and the next morning greeting (the widget's "MEGA statement")
   - below → dropped and logged
4. **Timing.** `deliverAt` is inside the window, outside quiet hours (kids: held until quiet hours end) and under the daily cap. Scheduled with `ctx.scheduler.runAt`; if the candidate is superseded or the event is cancelled, `ctx.scheduler.cancel`.
5. **Deliver.** At fire time, check again that it still applies.
   - Then send the push: the category id for buttons, `interruptionLevel` time-sensitive / active / passive by kind, and the matching Android channel.
   - The same card is written into the recipient's chat thread, and the widget's timeline is updated.
6. **Answer → effects.** A button tap (lock screen or thread) calls `notifications.answer`. That runs the same tool handlers as chat ("Yes" → tell Coral and add milk to Groceries) and records the reaction for the profiler.

**Clock:** every trigger and the pipeline read time through the `Clock` port. The demo's simulated clock ("jump to 4:40 PM") moves the family's `now` and fires due jobs through the same code.

### Chat tools (the agent's toolset)
`recall` · `remember` · `events.create / update / cancel` · `reminders.create` · `lists.add / check / remove` · `ask_member` (MEGA-to-MEGA request) · `show_ui` (thread UI blocks) · `web_search` · `weather` · `travel_time` · `make_image` (Muse Image: posters, wallpapers, stickers) · `follow_up` (schedule a check-back).
- Which tools each level gets is config (for example kids: no `ask_member` to adults' private threads; web search depends on the open decision below).
- Every tool validates arguments against `shared/domain` schemas and checks the viewer on the server.

### Web search
- Muse Spark's built-in `web_search` tool returns answers with inline citations (about $2.50 per 1,000 searches, from a third-party source; **verify**). It sits behind the `WebSearch` port. A Tavily adapter is written but **off in config** (decided Oct 25: start all-Meta) until the rules say non-Meta helpers are allowed.
- **Kids have search on, with a child filter** (decided Oct 25). The steps are config (`kidSafety`: age bands, blocked categories, preferred and blocked domains) and run through Muse Spark structured calls:
  1. **Query check** before searching: allowed / rephrase to something age-appropriate / blocked. Blocked topics come from the kid controls.
  2. **Search** with the kid profile. Safe-search is turned on if the provider has it **(verify for Muse `web_search`)**; kid-friendly domains are preferred.
  3. **Answer check:** the answer is written for the kid's age, checked against the same categories, and any citation on a blocked domain is removed. Homework mode still gives hints, not answers.
  4. **Parents:** blocked or rephrased searches are reported according to "what the kid's MEGA tells parents", and the kid sees the message "I can't look that up. Ask a grown-up."
  - No filter is perfect, so the result card always shows its sources and parents can turn search off per kid.
- Results are **untrusted data:** they can inform an answer (with sources shown in a result card) but can't trigger actions by themselves. Anything that changes data still goes through a normal tool call the member can see.

### Integrations (fit in 2–3 days of build)
A dev build is needed anyway (iOS push, widgets), so modules that require one are fine.

| Rank | Integration | Gives MEGA | Effort | Notes |
|---|---|---|---|---|
| 1 | Built-in family calendar, reminders, lists (ours, in Convex) | The core data for every proactive trigger | part of day 2 | No outside dependency |
| 2 | Web search (Muse Spark `web_search`) | Answers, local info, homework help | ~1 h + 2–3 h kid filter | Kids on, with the child filter |
| 3 | Weather: Open-Meteo + NWS alerts | "Rain at pickup, grab the umbrellas", severe weather alerts | 3–4 h | Free, no key. NWS is US-only (fine, decided Oct 25) and needs a `User-Agent` header |
| 4 | Travel time: Mapbox Directions (traffic) | "Leave by 4:50" | ~1 h | Home, school and work places are optional details in onboarding (decided Oct 25) |
| 5 | ICS subscriptions (school or team calendars) | Events without OAuth | 2–4 h | Poll every 30 min (cron) |
| 6 | Device calendar import (`expo-calendar`) | The phone's Google, iCloud and Exchange events, with no OAuth | 3–5 h | Polling only; the app syncs up on open and in the background |
| later | Google Calendar OAuth, Gmail, geofencing | — | — | Testing-mode tokens expire after 7 days; geofencing is unreliable in the background on iOS |

### Sign-in (decided Oct 25)
**Better Auth** through the Convex component `@convex-dev/better-auth` with the `@better-auth/expo` plugin (current docs: Convex Better Auth Expo guide, Better Auth Expo and Apple docs). Behind an `Auth` port, like everything else.
- **Apple and Google, natively, no browser:**
  - The app gets an ID token from `expo-apple-authentication` or `@react-native-google-signin/google-signin`.
  - Then `authClient.signIn.social({ provider, idToken })` verifies it on the server and signs in with no redirect.
  - Apple needs `appBundleIdentifier` set so the token's audience matches the iOS app.
  - Web uses the normal OAuth redirect. The callback is on the Convex site URL (`…convex.site/api/auth/callback/google`).
- **Sessions:** stored in `expo-secure-store` (`expoClient({ scheme, storage })`). The app scheme is in `trustedOrigins`. The Convex client is created with `expectAuth: true`, so queries wait for sign-in.
- **Adults** sign in with Apple or Google, then redeem the invite (QR or link) that ties their account to a family member.
- **Kids** often have no Apple or Google account. A kid's device redeems the invite plus the 5-digit parent code, and the server creates a session for the kid's member. The exact Better Auth piece still needs checking: the anonymous plugin, or a custom sign-in endpoint **(verify on day 1)**.
- **Identity on the server:** each Convex function gets the Better Auth user, maps it to `members`, and builds the viewer from that. That viewer is the only input to `readableScopeKeys`.

### Data model (Convex tables)
`families` · `members` (role, level, relationships, auth user id) · `megas` (look, personality, owner) · `grants` (sharing) · `threads` / `messages` (including UI blocks and answers) · `memories` · `profiles` · `events` · `reminders` · `lists` / `listItems` · `familyEvents` (the event log) · `candidates` · `notifications` (deliveries, answers, reactions) · `requests` (MEGA to MEGA) · `integrations` (connections; tokens stay on the server) · `usage` (tokens and spend) · `clocks` (simulated time).

### Cost
Muse Spark 1.3 costs $1.25 per million input tokens ($0.15 cached) and $4.25 per million output tokens. Muse Image is about $0.01 an image. Hackathon credits are reportedly $150 **(verify)**. The rate limiter and a daily budget per family (config) keep the demo within that.

### Smoke test results (Oct 26, `npm run smoke:meta`)
| Test | Result | What the adapters must do |
|---|---|---|
| Chat (`/v1/chat/completions`, `muse-spark-1.3`) | ✅ ~1 s | **It's a reasoning model:** hidden reasoning counts against `max_tokens`. Use a generous `max_tokens` and `reasoning_effort: "low"` for quick calls (judge, writer); 10 tokens returned an empty reply |
| Tool calling | ✅ ~0.8 s | OpenAI-style `tools` / `tool_calls`; arguments arrive as a JSON string |
| JSON-schema output | ✅ ~1.8 s | `response_format: { type: "json_schema", json_schema: { strict: true } }` works |
| Web search (`/v1/responses`, `tools: [{ type: "web_search" }]`) | ✅ ~4 s | Sources are in each `web_search_call.action.sources` (ask with `include: ["web_search_call.action.sources"]`); inline `annotations` came back empty. Messages with `phase: "commentary"` are interim narration, not the answer |
| Transcribe (`POST /v1/asr/transcribe`) | ✅ ~1.5 s for 3.6 s of audio | Multipart: a JSON `request` part (`{ model: "muse-voice-transcribe-1.0", audioEncoding: "WAV" }`) plus an `audio` part. Returns `transcript`, `audioDurationMs`, `turns`. Heard "Hey Zap" correctly; vocabulary biasing is available for MEGA names. Realtime: `wss://api.meta.ai/v1/asr/realtime`, auth in the handshake frame |
| Muse Image | not run | Needs your go-ahead to spend |
| Rate limits | not hit | Watch in G2 |

### Day-1 smoke tests (before building on them)
1. Muse Spark tool calls and JSON-schema output through the OpenAI SDK.
2. `web_search` with citations.
3. Muse Voice Transcribe: realtime WebSocket vs batch, and how the app gets audio to it without exposing the key (a Convex action with an uploaded clip, or a short-lived token).
4. Muse Image with a reference image.
5. Rate limits.
6. The official hackathon rules: code written before the start, and whether non-Meta helper models are allowed.

---

## Art

### The MEGA avatar is drawn in code (decided Oct 24)
No image generation is used for the avatar. `shared/sprite/` holds the body as data and a renderer:
- `mega-template`: parts on a 32×40 grid, walk frames, eye expressions, a decal library and the badge tile, all as data
- `mega-sprite`: renders the data to a pixel grid, then to SVG
- The renderer outlines each part (so the navy line between arm and torso comes out automatically) and derives the light and dark shell shades from the one hex color the family picks.
- **What it draws:** front, back and side views (the side mirrored for left), the head badge on a white tile (so the navy outline reads on dark themes), step frames and expressions.
- **In the app** it renders through react-native-svg or Skia.
- **A MEGA's look is config:** `{ shell: "#2FB8B0", sticker: "star", personality: "brief" }`. The shell can be any hex. A new preset color or sticker is a config edit.
- **Anatomy is fixed by the template:** wide retro-TV head, one silver antenna with a cyan-white tip, two identical ears, a blank visor (eyes are drawn on top), two arms with fingerless mitten hands, two legs with boots.
- **Why:** every image is identical and on-model, renders instantly, costs nothing, and can never grow an extra hand or antenna.
- The prototype is in `prototypes/megasprite/` (run `node export.mjs`, then `python3 preview.py out` and `python3 walk.py out teal`).
- `pixel-paint` is the shared engine (shapes, outline, shading, SVG); `hq-template` holds rooms and furniture as data, `hq-room` renders them, and `node export-hq.mjs <dir>` writes the room, every walk frame and `hq.json` (walkable grid and stations).

### Generated scenes (Muse Image)
Muse Image is used only for what code can't draw: chat wallpapers, memes, room posters and MEGA stickers (rooms are drawn in code since Oct 25). Stickers are a preset set of 4, generated once and stored; they're downscaled to the sprite's pixel grid and placed at the template's sticker anchor. (Greeting scenes were dropped Oct 24: the greeting is the badge animation.)
- The code-drawn sprite is passed as the reference image, so the MEGA in a scene matches the one in the app.
- Scene requests carry `{ kind, mega }` plus style rules from config: pixel art, limited palette, navy outline, cozy family home.
- Generated files live in Convex storage; each MEGA record points to its current scene for each `kind`.
- Muse Image costs about $0.01 per image and takes 15–38 seconds, so scenes are generated in the background and a plain themed card shows until they are ready.

### Animation
Nothing is animated by generating new images. Only two things move:
- **Badge = head only.** The visor position is known from the template, so the app draws on it directly:
  - eyes: blink, happy arcs, sleepy, wink
  - a voice meter for talking
  - small head bobs and tilts, and an antenna-tip pulse while thinking, all with Reanimated
- **Workspace = scripted overworld walking, like the Game Boy / GBA Pokémon games.** Each MEGA's room is a top-down (3/4 view) tile map. The MEGA moves one tile at a time in 4 directions, and its walk follows the work it's actually doing:
  - **Stations** are tiles in the room tied to a kind of work, for example: kitchen counter for recipes and meals, desk for homework, wall calendar for scheduling, computer for research, mailbox for messages to other MEGAs, bed for night mode. Stations are config: `{ id, tile, facing, emote }`.
  - **Activity → station mapping** is config too: `{ recipe: "kitchen", calendar: "wall_calendar", homework: "desk", research: "computer", message: "mailbox", sleep: "bed" }`. The agent's job events (Convex) drive a small script: walk to the station → face it → show an emote bubble ("!", "…", "♪") → work → walk back or idle. A new kind of work means a config edit, not new code.
  - **Movement:** grid pathfinding (BFS on the walkable tiles); about 250 ms per tile with a 2-frame step, as in the originals. Idle MEGAs wander now and then, and turn to face whoever taps them.
  - **Status text** shows in a Pokémon-style text box ("Teal is at the desk working on math."), from the same job event.
  - **Sprites** come from `mega-sprite`; step frames lift one boot and bob the body by one pixel. Scaled up with nearest-neighbour so the pixels stay crisp.
  - **Rooms are drawn in code too** (Oct 25): floor, walls and furniture are pixel data rendered by the same engine as the MEGA. A room is config: size, furniture `{ kind, tile }`, stations and the walkable grid. Decorating a room edits that config.
- **Not doing:** gesture animations (wave, cheer).

---

## Schedule

**Before Oct 26 (no app code):** submit the application, check the hackathon rules on code written beforehand, write the scene style rules and prompts, and test Muse Image with the code-drawn sprite as the reference.

| Day | Date | Build |
|---|---|---|
| 1 | Oct 26 | Repo, Expo + Convex, `shared/` config and ports, adapter registry, sign-in (Better Auth: Apple, Google, kid invite + parent code), theme system (Midnight default), tab shell, **dev build on iPhone, test push received**. `shared/sprite` ported. **Meta API smoke tests** (see Backend). `Clock` port and simulated clock. |
| 2 | Oct 27 | Chat: agent loop, streaming, tools (events, reminders, lists, `show_ui`), memory (scopes, writer, recall, `learningPolicy`, save chips), profiles seeded from onboarding, `@` mentions |
| 3 | Oct 28 | Proactive engine: triggers, draft, judge, timing, push with buttons, answers → effects, MEGA-to-MEGA requests, widget and Today statements |
| 4 | Oct 29 | Integrations: web search with the kid filter, weather and alerts, travel time ("leave by"). Talk mode (hold to talk, `Transcriber`). |
| 5 | Oct 30 | Integrations: ICS feeds, device calendar import. Nightly profiler and check questions. Onboarding chat (create MEGA, add family, invite, parent code). |
| 6 | Oct 31 | HQ and rooms (tile room, walking to stations from job events, decorate). MEGA profile, look and personality. |
| 7 | Nov 1 | Family: members, kid controls, calendar, Coming up, lists. Settings (theme, wallpaper). |
| 8 | Nov 2 | Kid experience (homework mode, kid chat, kid wins). Widgets. Wallpaper generation. Spoken MEGA name detection. |
| 9 | Nov 3 | Polish, sample family data, demo script, record on iPhone including lock-screen pushes |
| 10 | Nov 4 | Spare day. Submit by 9 PM ET. |

## Risks
1. **Scenes drifting from the code-drawn MEGA.** Mitigation: pass the sprite as the reference image, keep scene kinds narrow, and fall back to a plain themed card. The avatar itself can't drift: it's drawn in code.
2. **Meta Model API limits and response times** for live art. Mitigation: generate art asynchronously and show the template image until it's ready.
3. **iOS push setup.** Mitigation: get a push working on day 1.
4. **Muse Spark tool calling and structured output details are unconfirmed.** Mitigation: smoke test on day 1; the `ChatModel` port can fall back to prompted JSON with schema validation and retry.
5. **Memory recall without embeddings misses paraphrases.** Mitigation: the profile card and pinned facts are always in context, text search covers names and keywords, and the model can call `recall` with its own search terms. A vector adapter can be added behind `MemoryIndex`.
6. **Proactive spam.** Mitigation: judge thresholds, daily caps, quiet hours and reaction weights are all config, and dropped candidates are logged so the thresholds can be tuned.
7. **The kid search filter lets something through.** Mitigation: checks on both the query and the answer, blocked domains, sources always shown, parent reporting, and search can be turned off per kid.
8. **Learnings that are wrong or creepy.** Mitigation: patterns need N sightings and a check question, every save shows a chip that can undo it, unconfirmed learnings fade, and sensitive things are saved only when asked.

## Open items
- [x] "World" tab is named **HQ** (Oct 24)
- [x] Speech to text: Muse Voice Transcribe file endpoint works (Oct 26)
- [x] Start all-Meta: no embeddings, Tavily off (Oct 25)
- [x] Sign-in: Better Auth with Apple and Google (Oct 25)
- [x] Kids get web search with a child filter (Oct 25)
- [x] Places in onboarding, NWS alerts (Oct 25)
- [ ] Non-Meta helper models (embeddings, search fallback) allowed by the official rules?
- [x] Parents can read kids' chats, as a kid control that's on by default (Oct 26)
- [ ] Kid sign-in mechanism in Better Auth (anonymous plugin or custom endpoint)
- [ ] Does Muse `web_search` have a safe-search option?
- [ ] Hackathon rule on code written before the start
- [x] **Meta API billing** set up (Oct 26). Model ids confirmed: `muse-spark-1.3`, `muse-image-1.0`, `muse-voice-transcribe-1.0`, `sam-3.1`, `muse-wonder-1.0`
