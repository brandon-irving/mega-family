# MEGA — Frontend ↔ Backend Contract

**Status: v0.3, approved Oct 26.**

This is the agreement both build tracks follow. The backend owns `convex/`, the frontend owns `app/` + `src/`, and this contract (which becomes `shared/`) is owned by both.

## Changelog
| Version | Date | Change |
|---|---|---|
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
**families**: `name`, `timezone`, `adminId?: id(members)` (set right after the admin member is created), `parentCode: string` (5 digits; shown to the admin in Settings, so it's stored rather than hashed and only `family.parentCode` returns it), `createdAt`

**members**: `familyId`, `name`, `role: Role`, `authId?: string` (Better Auth user id; empty for the toddler), `birthday?: "YYYY-MM-DD"`, `grade?: string`, `activities: string[]`, `hasMega: boolean`, `joinedAt?`
- indexes: `by_family`, `by_authId` (no family prefix: used at sign-in, before the family is known)

**relationships**: `familyId`, `from: id(members)`, `to: id(members)`, `kind: Relationship` ("from is to's daughter")
- index: `by_family_from`

**megas**: `familyId`, `kind: MegaKind`, `ownerId?: id(members)` (empty for the family MEGA; for a care MEGA it's the child), `name`, `look: { hex: string, sticker: string }`, `personality: Personality`, `job: { station: Station, label: string, busy: boolean, since: number }`
- index: `by_family_owner` (its familyId prefix lists a family's MEGAs)

**invites**: `familyId`, `memberId`, `tokenHash`, `expiresAt`, `redeemedAt?`
- indexes: `by_tokenHash` (no family prefix: used when joining), `by_family_member`

**grants**: `familyId`, `ownerId`, `granteeIds: id(members)[]`, `label` (sharing: "running late → Coral")

**sharing**: `familyId`, `memberId`, `schedule | lists | hqActivity: ShareLevel` (`me` · `partner` · `family`) (MEGA profile → What it shares)

**kidControls**: `familyId`, `memberId`, `homeworkMode: boolean`, `quietHours: { start: "HH:MM", end: "HH:MM" }`, `dailyMinutes?: number`, `blockedTopics: string[]`, `tellsParents: { safety: true, blockedSearches: boolean, summary: "none" | "daily" | "weekly" }`, `parentsCanReadChat: boolean` (default true), `webSearch: boolean` (default true)

**settings**: `familyId`, `memberId`, `theme: ThemeName`, `accent: "theme" | "mega" | { hex: string }`, `wallpaper: { kind: "preset", id } | { kind: "photo", storageId } | { kind: "generated", imageId } | null`, `notify: { loudKinds: NotificationKind[], quietHours, dailyCap: number }`, `pushTokens: { token, platform: Platform }[]`

### Chat
**threads**: `familyId`, `ownerId: id(members)` (one private thread per member to start), `megaIds: id(megas)[]` (the owner's MEGA plus any @'d), `lastAt`

**messages**: `familyId`, `threadId`, `at`, `author: { kind: "member", id } | { kind: "mega", id } | { kind: "system" }`, `via: Via`, `body: MessageBody` (§3), `streamId?: string` (while the reply is streaming), `chips: SaveChip[]`, `reaction?: Reaction`, `fromNotificationId?`
- index: `by_family_thread_at`

### Memory and learning
**memories**: `familyId`, `scope: Scope`, `scopeKey: string` (`<familyId>:family` · `<familyId>:adults` · `<familyId>:personal:<memberId>` · `<familyId>:shared:<grantId>`), `about: id(members)[]`, `kind: MemoryKind`, `text`, `data?: any`, `source: { kind: "message" | "onboarding" | "integration" | "admin" | "profiler", ref?: string }`, `trigger: LearningTrigger`, `confidence: number` (0–1), `confirmed: boolean`, `sensitive: boolean`, `validUntil?`, `supersedes?: id(memories)`, `pinned: boolean`, `createdAt`, `lastUsedAt`
- search index `search_text` on `text`, filtered by `familyId` and `scopeKey`
- indexes: `by_family_scopeKey`, `by_family_kind`

**profiles**: `familyId`, `memberId`, `callMe`, `basics: {…}`, `routines: { text, days: number[], time?: "HH:MM", confirmed }[]`, `places: { label: "home" | "school" | "work" | string, address, lat, lng }[]`, `proactive: Record<NotificationKind, { sent, answered, ignored, up, down }>`, `checkQuestions: { memoryId, question, askAfter }[]`

### Plans and lists
**events**: `familyId`, `title`, `start`, `end?`, `allDay?: "YYYY-MM-DD"`, `who: id(members)[]`, `place?`, `source: "mega" | "ics" | "device"`, `externalId?`, `createdBy?` (empty for imported events), `scope: Scope`, `cancelled: boolean`
- index: `by_family_start`

**reminders**: `familyId`, `forMemberId`, `text`, `dueAt`, `eventId?`, `done: boolean`, `createdBy?`
- index: `by_family_member_due`

**lists**: `familyId`, `name`, `scope: Scope`, `ownerId?`
**listItems**: `familyId`, `listId`, `text`, `checked: boolean`, `addedBy?`, `at`
- indexes: lists `by_family`; listItems `by_family_list`

### Proactive and notifications
**familyEvents** (the log): `familyId`, `at`, `type` (`said` · `calendar.changed` · `list.changed` · `reminder.due` · `weather.alert` · `notification.answered` · `clock.tick` · `job.changed`), `payload: any`, `processed: { memory, profiler, triggers }`
- index: `by_family_at`

**candidates**: `familyId`, `recipientId`, `kind: NotificationKind`, `dedupeKey`, `draft: { text, buttons: ButtonSetId }`, `score?: number`, `reason?`, `delivery?: Delivery`, `window: { from, to }`, `deliverAt?`, `scheduledId?`, `status: "new" | "scheduled" | "delivered" | "dropped" | "cancelled"`
- indexes: `by_family_dedupeKey`, `by_family_status`

**notifications**: `familyId`, `recipientId`, `candidateId?`, `kind`, `loudness: Loudness`, `title`, `body`, `megaId`, `buttons: Button[]`, `messageId?` (the same card in the thread), `sentAt?` (empty while held), `heldUntil?` (kid quiet hours), `answer?: { buttonId, at, via: Via }`, `reply?: string` (lock-screen reply)
- index: `by_family_recipient` (familyId, recipientId, sentAt)

**requests** (MEGA to MEGA): `familyId`, `fromMemberId`, `toMemberId`, `text`, `status: "open" | "accepted" | "declined" | "done"`, `notificationId?`
- index: `by_family_to`

### Places, art and system
**rooms**: `familyId`, `ownerId?` (empty = HQ), `size: { w, h }`, `wallColor`, `furniture: { kind, x, y, color?, posterImageId? }[]`

**images**: `familyId`, `createdBy`, `purpose: "poster" | "wallpaper" | "sticker" | "scene"`, `prompt`, `storageId?`, `status: "queued" | "ready" | "failed"`, `cost?`

**integrations**: `familyId`, `memberId?`, `kind: "ics" | "deviceCalendar" | "weather"`, `config: any`, `lastSyncAt?` (secrets in env, never in rows the client can read)

**usage**: `familyId`, `day: "YYYY-MM-DD"`, `tokensIn`, `tokensOut`, `searches`, `images`, `cents`

**clocks**: `familyId`, `mode: "real" | "simulated"`, `offsetMs: number`

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
  | { kind: "search", query, answer, sources: { title, url }[] }
  | { kind: "weather", summary, at }
  | { kind: "travel", to, leaveBy, minutes }
  | { kind: "request", requestId }
  | { kind: "notification", notificationId }                       // a push, mirrored into the thread

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
| `invites.create` | m | `{ memberId }` | `{ url, qrPayload, expiresAt }` | real |
| `invites.redeem` | m | `{ token, parentCode?: string }` (code required for kids) | `{ memberId }` | real |
| `family.parentCode` | q | — (admin only) | `{ code }` | real |

### Chat and talk
| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `chat.thread` | q | `{ paginationOpts }` | page of `Message` (newest first) | real |
| `chat.send` | m | `{ text, mentions?: id(megas)[], via: "text" \| "voice", attachments?: storageId[] }` | `{ messageId, replyMessageId, streamId }` | stub (canned streamed reply) |
| `chat.stream` | h | `POST /chat-stream { streamId }` | the streamed text (persistent-text-streaming) | stub |
| `chat.streamBody` | q | `{ streamId }` | `{ text, status }` | real (component) |
| `chat.answerBlock` | m | `{ messageId, answer: BlockAnswer, via: Via }` | `{ answerMessageId }` | stub effects |
| `chat.react` | m | `{ messageId, reaction: Reaction \| null }` | `null` | real |
| `files.uploadUrl` | m | — | `string` | real |
| `talk.transcribe` | a | `{ storageId }` | `{ text, mentions: SpokenMention[] }` (batch; realtime is decided by the day-1 smoke test) | stub |

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
| `family.comingUp` | q | — | `Event[]` (next 2 hours) | real |

### MEGA profile, memory and learnings
| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `megas.mine` | q | — | `Mega` | real |
| `megas.update` | m | `{ name?, look?, personality? }` (kids can't rename) | `null` | real |
| `sharing.set` | m | `{ schedule?, lists?, hqActivity? }` | `null` | real |
| `memories.list` | q | `{ scope?: Scope, search?: string, paginationOpts }` | page of `Memory` (only readable scopes; the full list for admin) | real |
| `memories.forget` | m | `{ memoryId }` | `null` | real |
| `memories.changeScope` | m | `{ memoryId, scope: Scope, granteeIds? }` | `null` | real |
| `megas.activity` | q | `{ paginationOpts }` (admin) | page of `familyEvents` summaries | real |

### Family
| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `family.members` | q | — | `MemberCard[]` (member + MEGA badge + role + status) | real |
| `family.member` | q | `{ memberId }` | `MemberDetail` (+ `kidControls` if the viewer is their parent) | real |
| `kidControls.set` | m | `{ memberId, patch: Partial<KidControls> }` (parents only) | `null` | real |
| `family.kidThread` | q | `{ memberId, paginationOpts }` (only if `parentsCanReadChat`) | page of `Message` | real |
| `calendar.range` | q | `{ from, to }` | `Event[]` | real |
| `events.create` / `.update` / `.cancel` | m | event fields / `{ eventId, patch }` / `{ eventId }` | `id` / `null` / `null` | real |
| `lists.all` | q | — | `{ list, items }[]` | real |
| `lists.addItem` / `.check` / `.remove` | m | `{ listId, text }` / `{ itemId, checked }` / `{ itemId }` | `id` / `null` / `null` | real |
| `requests.respond` | m | `{ requestId, accept: boolean }` | `null` | stub effects |

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
| `notifications.answer` | m | `{ notificationId, buttonId, via: "push" \| "block" \| "widget" }` | `{ reply: string }` (shown on the lock screen) | stub effects |

### Demo
| Function | Type | Args | Returns | Day 1 |
|---|---|---|---|---|
| `clock.get` | q | — | `{ now, mode }` | real |
| `clock.jump` | m | `{ to: number }` (admin, demo flag on) | `null` (fires due jobs through the same code) | real |

---

## 5. Push notifications
- **Payload `data`** (every push): `{ v: 1, notificationId, kind: NotificationKind, threadId, messageId }`
- **Category id** = `ButtonSetId` from config, registered by the app at start with `setNotificationCategoryAsync`. Each button: `{ id, label, opensApp: false }`. Placeholders until we decide the sets:
  - `reminder.default`: `on_my_way` "On my way" · `snooze_5` "Snooze 5 min"
  - `request.default`: `yes` "Yes" · `cant` "I can't"
  - `tip.default` and `update.default`: no buttons
- **Loudness → platform:** `timeSensitive` / `active` / `passive` → iOS `interruptionLevel`; Android channels `mega.loud` and `mega.quiet` (ids in config).
- **Answer path:** a button tap calls `notifications.answer` (from the response listener, or from a background task if the app was killed; checked on day 3). The thread block uses the same button ids, so both paths run the same code.

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
- `limits` (daily caps, quiet hours defaults, agent max steps, spend per family per day)
- `learningPolicy` (trigger × kind → save now / save unconfirmed / queue / ask / drop, default scope, pattern N and window, fade half-life)
- `kidSafety` (age bands, blocked categories, domains)
- `integrations` (enabled, poll intervals)
- `demo` (simulated clock allowed)

## 8. Ports (internal to the backend; listed so the master plan is complete)
`ChatModel.chat({ messages, tools?, schema? })` · `ImageGenerator.generate({ prompt, referenceImage? })` · `Segmenter.segment({ image, prompt })` · `Transcriber.transcribe({ audio })` · `WebSearch.search({ query, safe })` · `MemoryIndex.search({ scopeKeys, query, limit })` · `Weather.forecast({ lat, lng })` / `.alerts(...)` · `Directions.travelTime({ from, to, departAt })` · `CalendarFeed.fetch({ url })` · `PushSender.send(...)` · `BlobStore.put/get` · `Clock.now(familyId)`

## 9. Error codes
`UNAUTHENTICATED` · `NOT_A_MEMBER` · `FORBIDDEN` (role or parent check) · `NOT_FOUND` · `INVALID_INVITE` · `WRONG_PARENT_CODE` · `RATE_LIMITED` · `BUDGET_EXCEEDED` · `KID_BLOCKED` (kid filter) · `VALIDATION`

## 10. Seed: the sample family (`seed.sampleFamily`, internal)
Members use generic labels: Admin (MEGA Teal), Partner (MEGA Coral), Twin 1 (MEGA Zap), Twin 2 (MEGA Sunny), Toddler (care MEGA, used by parents). The seed also adds a week of events (from the mockups' `family-data.js`), a Groceries list, a few memories in each scope, one open request (milk) and a kid's held reminder, so every screen has data on day 1.

---

## Decisions (Oct 26)
1. Kid wins: no streaks or counters; the celebration animation stays. PLAN.md updated.
2. One private thread per member; MEGAs join when @'d, typed or **spoken** (see `talk.transcribe`). No family group chat yet.
3. Parents can read a kid's chat (`family.kidThread`) but can't reply as the kid.
4. Button sets stay placeholders. A set lives entirely in `shared/config/buttonSets` (ids, labels, which kind uses which set), so trying new ones is a config edit. The app registers notification categories from that config at startup, and answers are handled by button id.
5. Toddler: no login; a care MEGA run by the parents; its memories are adults-scope.
