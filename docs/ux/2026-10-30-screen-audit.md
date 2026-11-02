> Current demo workflow: [Settings → Demo Console](../demo-console.md). The three-person live Gmail scenario and age-group policy in that guide supersede historical demo, seeded-reset, and sample-sign-in instructions below.

# MEGA UI/UX source audit

## Scope and evidence

This report covers every user-facing route in `src/app`, the shared navigation and sheet layouts, and the major interactive surfaces rendered inside Chat. It brings together three read-only source audits: Chat/profile/settings, HQ/family/organization, and onboarding/kids/integrations.

The user’s priorities are to reclaim conversation space, put composer controls inside the input, make the MEGA profile useful and attractive, replace the oversized static sign-in character with several small interacting characters, keep HQ interaction feedback within its main interface, make Settings easy to find, and provide a home for **all useful MEGA suggestions**, with gifts as one Ideas category.

Evidence labels used throughout:

- **Source-confirmed:** behavior, dimensions, routes, or guards directly present in the inspected code. Dimensions calculated from styles are not measurements from a device.
- **Recommendation:** a proposed design or product decision. These changes have not yet been usability-tested.
- **Runtime visual inspection:** Chat, MEGA profile, HQ, Family, and Calendar were also inspected in the running desktop web app. HQ's selected Calendar panel was below the visible room area; a Calendar event opened the location editor; Family offered Places and Calendar but no Lists or Ideas shortcut. The browser's phone-size override did not change its reported viewport, so this report does not claim that source-derived phone-width or keyboard risks were reproduced on a device.

This delivery contains research and an interactive concept prototype; production UI implementation remains future work. No application code was changed for this report. External references and the proposed implementation sequence are in [the design direction](2026-10-30-design-direction.md). There are no measured claims about faster task completion, engagement, or conversion.

Priority meanings:

| Priority | Meaning |
| --- | --- |
| P1 | First implementation wave: a common task is hard to complete, a control misleads, a requested core destination is missing, or privacy needs attention before expanding access. |
| P2 | Next wave: improve the screen’s hierarchy, reliability, accessibility, or task flow. |
| P3 | Later refinement after the task flow works well. |

## Main conclusions

The primary problem is not a lack of visual styling. Important tasks compete with character art, controls are distributed across unrelated destinations, and several screens still expose unfinished flows. A shared design system already exists; it should be applied more deliberately instead of replaced wholesale.

| Priority | Source-confirmed issue | Concrete direction |
| --- | --- | --- |
| P1 | Assistant messages reserve a badge gutter and cap content width; composer icons compete with the text field. | Give assistant content the thread’s useful width and use one full-width composer with controls inside it. |
| P1 | The visible Attach button has no callback; Calendar event taps open location editing rather than details; member Message opens generic Chat. | Complete the promised action or change the label and affordance to match its actual result. |
| P1 | HQ selection feedback is a sibling below a tall room. | Keep one contextual panel inside the main viewport, with a clear association to the selected object. |
| P1 | Ideas has no general route, data model, or public API. | Add an adult Ideas destination backed by a proper suggestion contract, including source, audience, state, and category. |
| P1 | Settings is reached through the character profile. | Put the same Settings gear in every top-level screen’s header. |
| P1 | Personal rooms are text placeholders; Decorate saves furniture that cannot be seen there. | Complete the room preview/placement loop and remove milestone language. |
| P1 | Sign-in forms lack keyboard-aware scrolling; password recovery is a dead end. | Use a capped, keyboard-aware sheet and implement a real recovery/help path. |
| P1 | Gift ideas copied to a generic adults list lose recipient-specific visibility. | Resolve audience preservation before bringing gift suggestions into a broad Ideas index. |
| P1 | Profile combines customization, privacy, app settings, and history in a tall stack. | Use a compact identity header and focused subpages with grouped rows. |
| P2 | Many writes have no visible pending, success, or failure state. | Give each action a consistent local state and recovery path. |

## Navigation and shared structure

### Proposed information architecture

This is a proposed navigation direction for review. The user confirmed Ideas' scope, not the number or order of tabs:

| Audience | Top-level destinations | Shared utilities |
| --- | --- | --- |
| Adult/admin | **Chat · Ideas · HQ · Family** | One consistent Settings gear in each top-level header; Today remains a useful task summary. |
| Child | **Chat · HQ** initially | Preserve existing navigation until an age-appropriate Ideas experience has its own content and permission design. Keep utility placement consistent with the child’s permitted settings. |

Ideas should collect useful MEGA suggestions across categories. It should not be a renamed Gift ideas screen or a view that indiscriminately copies every private chat message. Family should make Calendar, Lists, Places, and member management visible. HQ remains a spatial, playful way to access the same tasks; it should not be the only discoverable path to them.

**Current source:** adult/admin tabs are Chat, HQ, Family; child tabs are Chat, HQ. Both platforms use the same role metadata. Web changes to a 220pt sidebar at 768pt. See [roles](../../shared/config/roles.ts#L19-L29), [tab metadata](../../src/features/shell/tabs.ts#L9-L16), [web layout](../../src/app/(tabs)/_layout.tsx#L26-L60), and [native layout](../../src/app/(tabs)/_layout.native.tsx#L9-L20).

### Foundations to keep

- Existing spacing scale: 4, 8, 12, 16, 24, 32pt; adult body text 16/22pt and child body text 19/26pt; normal target sizes 44pt adult and 56pt child; theme-aware contrast helpers. See [theme configuration](../../shared/config/theme.ts).
- Existing native safe-area/tab-bar handling and keyboard provider. The provider enables keyboard-aware components; it does not automatically make every screen keyboard-safe. See [root layout](../../src/app/_layout.tsx#L15-L31).
- Consistent sheet width and safe areas. The shared route sheet has a title/Close header and scrolling body, capped at 720pt on wide displays. See [Sheet](../../src/ui/Sheet.tsx#L16-L50).
- Existing auth and role gates. Auth loading, signed-out, signed-in without family, and ready states are distinct; invite routes and in-family routes have separate guards. See [AuthGate](../../src/features/shell/AuthGate.tsx#L25-L72). `AdultOnly` redirects unauthorized users before child queries mount, and can narrow to admin. See [RoleGate](../../src/features/shell/RoleGate.tsx#L11-L17).

### Shared changes

**Recommendation:** define a compact top-level header, grouped settings rows, action-state feedback, and a small number of sheet patterns before restyling individual screens. Keep primary actions in stable positions. Use character animation where the task benefits from it, while giving forms, messages, lists, and controls priority in the layout.

The standard verification matrix must include keyboard shown/hidden, multiline input, large text, long names, 320/390/430pt widths, tablet/wide web, light/dark/custom accent, reduced motion, and all three roles. A route title, visible body, and reachable dismissal/recovery control must remain available during loading and error states.

## Screen-by-screen audit

### 1. Chat and message deep links — P1

Routes: `/chat`, `/chat/[messageId]`. Surfaces include header, message list, author identity, saved-memory chips, interactive answer blocks, result cards, partial streaming response, errors/retry, adult composer, and child Talk/keyboard composer.

**Source-confirmed**

- Each MEGA message reserves a 32pt badge and 8pt gutter, shows a name label, and caps content at 82%; saved-memory chips indent by 40pt. The list adds 16pt horizontal padding. At an assumed 390pt viewport, the thread has 358pt useful width while the 82% cap is about 294pt. This is a style calculation, not a device measurement. See [MessageRow](../../src/features/chat/MessageRow.tsx#L93-L108) and [MessageList](../../src/features/chat/MessageList.tsx#L300).
- Adult camera, Attach, input, mic, and conditional Send are separate siblings. With 12pt outer padding, 44pt icons, and 8pt gaps, the input is about 210pt before Send appears at an assumed 390pt viewport. Typing adds another control and shrinks the field. See [Composer](../../src/features/chat/Composer.tsx#L108-L147).
- Attach is always drawn, but the route does not supply `onAttach`. The camera route is homework capture rather than generic photo attachment. See [route composer wiring](../../src/app/(tabs)/chat/index.tsx#L176-L186).
- The header contains a 40pt pulsing avatar and a persistent status that the route labels as a placeholder. Its pulse does not consult reduced motion. See [ChatHeader](../../src/features/chat/ChatHeader.tsx#L31-L76) and [status wiring](../../src/app/(tabs)/chat/index.tsx#L142-L150).
- A partial reply is displayed outside the message list between the thread and composer. A long streamed response can grow this region before moving into the final message row. See [streaming placement](../../src/app/(tabs)/chat/index.tsx#L196-L215).
- Child Talk mode uses a 72pt bar and separate 72pt round control. Choice blocks use two-up sizing even when labels are long. See [child composer](../../src/features/chat/Composer.tsx#L46-L100) and [choice blocks](../../src/features/chat/Blocks.tsx#L76-L78).

**Recommendation**

1. Let assistant prose and cards use the available thread width. Group consecutive messages by author and show a small author label when it changes; preserve clear identity when several MEGAs participate. Keep a reasonable cap for right-aligned user bubbles.
2. Build one full-width rounded composer: text region above an internal action row. Use one stable trailing slot for Voice/Send. Put homework capture and genuine attachments inside a working attachment menu.
3. Stream into the eventual assistant row with stable identity. Keep Retry and error feedback next to the affected message.
4. Use a compact, static header badge with the MEGA’s name and real actionable state. Put the consistent Settings gear here; retain Today when it represents useful pending work.
5. Preserve a large child Talk action but combine its controls into one coherent container. Provide a one-column option for long answer choices and larger text.

**States to verify:** initial loading; first-message onboarding; empty/ready thread; sending/failed send; streaming/retry; keyboard and multiline input; recording cancellation; long cards; older-message deep link; returning from another tab; several authors; child and parent read-only memory chips. Preserve bounded deep-link scroll retries, existing virtualization, and stable callbacks.

### 2. MEGA profile — P1

Route: `/mega-profile`.

**Source-confirmed:** a centered scale-5 sprite is 160×200pt before name/status and spacing. The screen then combines Look, three sharing selectors with nine chips, Notifications, Theme, Settings, Memories, Rules, and Activity as similarly emphasized sections. Notifications, Theme, and Settings all open the same generic `/settings` route. Rename and sharing do not provide local pending/error feedback. See [ProfileContent](../../src/features/profile/ProfileContent.tsx#L64-L127) and [route destinations](../../src/app/mega-profile/index.tsx#L29-L34).

**Recommendation:** make the page about the person’s MEGA. Use a compact horizontal identity area with a roughly 64–88pt character, name, personality, and Customize action. Move privacy controls to a focused Privacy & sharing editor with a current-audience summary. Group Memories and Activity as simple rows. Remove duplicate settings links unless each opens its promised subsection. Edit the name in a focused sheet with validation, Cancel/Save, and action feedback.

**States/roles:** loading/no MEGA; rename editing/saving/error; privacy save states. The normal profile UI hides rename, memories, and sharing controls from children and restricts unowned looks; Activity is admin-only and child Rules is read-only. These sections are role-dependent, not all displayed together. Direct-link enforcement needs separate review: `/mega-profile/memories` lacks a role guard, and the server permits an owner to modify a personal memory even when the owner is a child. Preserve the intended policy and resolve that distinction before widening discovery. Test long names, accessibility text, and keyboard avoidance in name editing.

### 3. Look & personality — P2

Route: `/mega-profile/look`.

**Source-confirmed:** another 160×200pt preview precedes many text chips for visual choices and a Save button at the bottom. Save has no pending/error state. See [LookPersonalityContent](../../src/features/profile/LookPersonalityContent.tsx#L39-L93).

**Recommendation:** keep a moderate preview visible while browsing visual categories such as Color, Face, Accessories, and Personality. Use swatches/part thumbnails rather than text-only color choices. Keep Save/Done reachable, show unsaved changes, and retain edits when saving fails. Keep adult custom hex input secondary. Respect child ownership restrictions.

**States:** current look; preview changes; unsaved exit; saving/error; locked/unowned child parts; keyboard for custom hex; reduced motion and small-height layout.

### 4. Settings and its editors — P1 for access and feedback, P2 for layout

Route: `/settings`. Overlays: Theme, Wallpaper, Notifications.

**Source-confirmed:** Settings is reached through profile rather than a top-level control. Multiple notification rows open the same editor. Quiet-hour changes use repeated minus/plus presses. Save failures are swallowed in the route. Parent-code and family administration controls share the broader settings page. See [SettingsContent](../../src/features/settings/SettingsContent.tsx), [time controls](../../src/features/settings/SettingsSheets.tsx#L151-L165), and [save handling](../../src/app/settings.tsx#L44).

**Recommendation:** one Settings gear on each top-level screen. Separate personal preferences, household administration, connected sources, and account actions into clear groups. Combine duplicate summary rows or deep-link to the appropriate editor. Use a suitable time picker with explicit timezone context. Show saving/saved/error feedback. Preserve masked parent-code disclosure and clear sign-out/switch-person actions.

**States/roles:** loading; adult/admin/child section availability; theme and wallpaper selection; notification permission differences; pending/failed writes; parent-code Show; sign-out/account switch; keyboard and large-text sheet layout. Do not expose admin controls merely because Settings becomes easier to find.

### 5. Memories — P1 for completeness, P2 for presentation

Route: `/mega-profile/memories`.

**Source-confirmed:** the data hook initially loads 20 memories; the route never calls `loadMore`. The view displays raw scope/kind metadata, and Forget is a text-sized pressable without a minimum target. See [memory pagination](../../src/data/useMega.ts#L38-L39), [route](../../src/app/mega-profile/memories.tsx#L15-L20), and [MemoriesContent](../../src/features/profile/MemoriesContent.tsx#L38-L44).

**Recommendation:** implement pagination before presenting the list as everything remembered. Keep results during refresh, distinguish no results from no memories, use readable audience labels, and give Forget a proper target and honest action feedback. An undo or confirmation flow must match the actual deletion semantics. Do not use Memories as an implicit substitute for intentional Ideas saves.

**States/roles:** adult access; first load/refresh/load more/end; empty/no search match; search keyboard; forget pending/error; visible versus editable memories. Parent viewing does not imply permission to edit a child’s memory.

### 6. Activity — P2

Route: `/mega-profile/activity`.

**Source-confirmed:** admin-only activity groups by day, supports filters and memory actions, and grows through mapped content within a scrolling sheet. See [ActivityContent](../../src/features/settings/ActivityContent.tsx) and [activity route](../../src/app/mega-profile/activity.tsx).

**Recommendation:** retain who-decided/provenance and date grouping. Make secondary reasoning expandable. Use a virtualized section list if history grows; do not animate every log row. Show loading/empty/filter-empty/error states distinctly.

**Roles:** admin only; preserve the route guard and underlying authorization. Deep links from non-admin accounts should not mount restricted queries.

### 7. Child Rules and parent Rules — P2

Routes: `/mega-profile/rules` and `/rules/[memberId]`.

**Source-confirmed:** the child page is read-only. The parent route wraps `AdultOnly`, then relies on `family.member` returning `kidControls` only to the child’s parents. Missing controls produce a generic not-ready line. Rule and daily-cap writes swallow failures. See [parent rules route](../../src/app/rules/[memberId].tsx#L19-L55) and [RulesContent](../../src/features/settings/RulesContent.tsx).

**Recommendation:** preserve clear parent-managed/locked explanations. Improve time editing and row density. Add local save states and meaningful unavailable/unauthorized recovery. Label the actual managing parents, rather than treating all adults as equivalent. Keep child controls visibly read-only.

**States:** loading, unavailable/non-parent, current settings, saving/error, daily-cap availability, long explanations, reduced motion, adult versus child view.

### 8. HQ shared room — P1

Route: `/hq`.

**Source-confirmed:** the room ends before the selection card begins. The feedback card is a sibling below the art, followed by a horizontal Rooms row. The whole screen scrolls. The room is 10×13 tiles, so its height is 1.3 times width. At an assumed 395pt viewport with 16pt side gutters, it is about 472pt high before header, system areas, tab bar, and selection feedback. See [room and feedback placement](../../src/features/hq/HqRoom.tsx#L158-L259), [scrolling route](../../src/app/(tabs)/hq/index.tsx#L139-L157), and [room dimensions](../../src/features/hq/hqLayout.ts#L22-L25).

Current tap-to-result behavior:

| Tap | Immediate feedback | Next result |
| --- | --- | --- |
| Calendar | Changes the card below the room | Open calendar → `/family/calendar` |
| Fridge | Changes the card below the room | Open lists → `/family/lists` |
| Desk or mailbox | Changes the card below the room | Generic `/chat`, without station context |
| Bookshelf, charger, rug, front door | Descriptive copy below the room | No follow-on action |
| Own MEGA | Name/status below the room | Talk or profile Details |
| Another member’s MEGA | Name/status below the room | Visit room |
| Family MEGA | Name/status/explanation below the room | Generic Chat |
| Room door | No intermediate inspection | Member room |

See [selection logic](../../src/features/hq/HqRoom.tsx#L150-L240) and [destinations](../../src/app/(tabs)/hq/index.tsx#L152-L155).

**Recommendation:** fit the room within the available viewport and show one dismissible context panel in the primary interface, attached visually to the selected target. A compact label/status/action can expand into a sheet for longer details. Keep selection visible without scrolling. Clearly distinguish actionable stations from decorative inspection. Provide an accessible textual station/room list. If desk/mailbox open generic Chat, carry context or use a label that accurately predicts the outcome.

**States:** loading/room absent; no active agents; moving/settled agents; all eight stations; own/other/family MEGA; one/large family; long status; close/reselect; screen reader order; reduced motion; short viewport and large text. Keep the current settled-walker timer shutdown.

### 9. Personal rooms and Decorate — P1

Route: `/hq/[memberId]`; kid Decorate tray.

**Source-confirmed:** the member route reexports HQ’s route, which renders `HqRoomList` rather than a room scene. Every nonempty `memberId` gets the title “My room,” even when visiting someone else. Kid furniture writes choose the next free coordinate, do not render the result in a room scene, and swallow errors. Visible copy refers to a future G5 milestone. See [member route](../../src/app/(tabs)/hq/[memberId].tsx), [title/content](../../src/app/(tabs)/hq/index.tsx#L46-L59), [placement wiring](../../src/app/(tabs)/hq/index.tsx#L83-L103), [tray/coordinates](../../src/features/store/KidRoomPanel.tsx#L24-L40), and [placeholder copy](../../shared/config/copy.ts#L228).

**Recommendation:** correct ownership titles, render the room and owned furniture, and make placement visible immediately with pending/error recovery. Provide selection, move, and remove behaviors with clear ownership rules if spatial editing is offered. Remove release-milestone language. Avoid presenting Decorate as a complete spatial tool while its only effect is invisible data mutation.

**States/roles:** own adult, own child, visiting another member, no room data, no furniture, new owned furniture, placement pending/failure, full room, store return, reduced motion. Only the owning child currently receives commerce controls.

### 10. Family home — P1 for discovery, P2 for hierarchy

Route: `/family`.

**Source-confirmed:** the header offers Places and Calendar only; member cards show name, role, and MEGA status; upcoming events cover the next two hours and are passive cards. No Lists, Ideas, or Add member entry appears in this screen. See [FamilyContent](../../src/features/family/FamilyContent.tsx#L25-L75).

**Recommendation:** make Calendar, Lists, Ideas, Places, and member/invite management findable. Use compact member rows with meaningful status; emphasize roles where they affect decisions. Make upcoming events actionable and explain the time window. Keep Family useful when there are no events in the next two hours.

**States/roles:** adult/admin tab; loading, empty upcoming events, unjoined member, member without MEGA, long family/member names. Existing child tab omission remains intentional.

### 11. Family member detail and invite panel — P1 for action truthfulness, P2 for structure

Route: `/family/[memberId]`.

**Source-confirmed:** Message pushes `/chat` without identifying the member. A missing member returns a LoadingScreen labeled “Member not found.” Identity, controls, invite QR/link/share actions, and read-only kid transcript can all occupy the same scrolling sheet. The kid transcript subscription is explicitly gated by parenthood and the child’s chat-sharing control. See [member route](../../src/app/(tabs)/family/[memberId].tsx#L25-L62), [member content](../../src/features/family/MemberDetailContent.tsx#L39-L76), and [InvitePanel](../../src/features/family/InvitePanel.tsx#L64-L107).

**Recommendation:** provide focused About, Controls, and Chat history destinations. Implement a contextual Message action or rename it. Show invite state compactly, expanding into Share/QR/Copy when needed. Replace missing-member loading with a recoverable error/empty state. Keep transcript reading in a suitable virtualized container rather than extending the already long member sheet.

**States/roles:** loading/missing member; own/other member; adult/kid; parent/non-parent; chat reading enabled/disabled; unjoined/pending/expired invite; invite generation/copy/share errors; empty/loading transcript. Parent reading never enables speaking or saving on the child’s behalf.

### 12. Calendar and event location — P1 for event flow, P2 for hierarchy

Route: `/family/calendar`; EventPlace overlay.

**Source-confirmed:** the week pager/day strip and household/private filters provide useful structure. Adults tapping an event open a location picker, not general event details. There is no visible Create event action. The content is keyed by week; its locally held visibility filters reset during paging. An empty location picker says to add places first without an action to do so. See [calendar route](../../src/app/(tabs)/family/calendar.tsx#L58-L93), [filter state](../../src/features/family/CalendarContent.tsx#L76-L89), and [EventPlaceSheet](../../src/features/integrations/EventPlaceSheet.tsx#L37-L81).

**Recommendation:** event tap opens details: time, people, audience, place, and appropriate actions. Move location editing inside that flow. Add a clear Create event or context-preserving Ask MEGA action. Preserve filters when paging. Link missing places directly to creation. Retain the clash banner, explicit private layer, holiday indications, and return-to-today control.

**States/roles:** initial/week load; no events; hidden layers; previous/next/current week; private/shared/family event; all-day/multiday/long titles; holiday/routine pause; clash pending; adult editing versus child read-only; location unavailable/saving/error. Verify family timezone behavior alongside device timezone changes.

### 13. Lists — P1

Route: `/family/lists`.

**Source-confirmed:** an empty collection only says “No lists yet.” Existing lists support add/check/remove but no direct create-list UI. Checkbox is 22×22 without hit slop; remove is a bare text “✕.” Add relies on keyboard submit and clears text immediately; the route does not display write state/errors. See [ListsContent](../../src/features/family/ListsContent.tsx#L21-L71), [route mutations](../../src/app/(tabs)/family/lists.tsx#L17-L23), and [public list API](../../shared/domain/api.ts#L543-L548).

**Recommendation:** visible list creation and a useful empty state; whole-row checking with a proper target; explicit Add; open/completed sections; clear audience; predictable deletion with supported Undo or confirmation; retained draft on add failure. A list summary in Today should open the list. Keep child access limited to visible scopes, independently of tab placement.

**States:** no lists; empty list; completed-only list; long item text; add keyboard; pending/error; shared changes; many items/lists; adult/private/adults/family visibility. Scale with virtualized rows if needed.

### 14. Today — P1 for useful links, P2 for ordering

Route: `/today`.

**Source-confirmed:** the screen displays a MEGA statement, events, decisions, and list counts. Event and list cards are passive. Decision mutations have no local busy/error feedback; empty secondary sections still appear. See [TodayContent](../../src/features/today/TodayContent.tsx#L31-L88) and [Today route](../../src/app/today.tsx#L15-L21).

**Recommendation:** put actionable decisions first, make event/list rows open their full destination, collapse low-value empty sections, and show decision progress and result. Preserve a calm all-clear state. For children, consider a focused current-tasks view so homework, chores, and routines do not require finding old chat messages.

**States:** loading; no pending work; events only; lists only; held notifications; decision pending/failure; long request; child/adult view; deep link from a widget.

### 15. Places and place editor — P2

Route: `/places`; add/edit overlay.

**Source-confirmed:** each row has icon, name, truncated address, geocode status, and Edit pill. Adults edit, children read. A read error can appear above an otherwise empty-looking list. See [Places route](../../src/app/places.tsx#L25-L53) and [PlacesContent](../../src/features/integrations/PlacesContent.tsx#L33-L91).

**Recommendation:** prioritize recognizable name/address, open details from the row, and move maintenance controls there. Emphasize geocode status only when it affects the task or needs attention. Add an actionable retry and keep failed loading distinct from a truly empty household. Preserve clear read-only child copy, single-home constraint, and outdoor setting.

**States:** loading/error/empty/maximum places; adult/child; add/edit; missing name/address; geocoding pending/failed/success; save/remove pending/error; keyboard and longer addresses.

### 16. Search log — P2

Route: `/searches/[memberId]`.

**Source-confirmed:** `AdultOnly` protects entry; the log query runs only when the returned parent control permits blocked-search reporting. Missing detail/controls returns a LoadingScreen indefinitely. With reporting enabled but data pending, the view has no explicit loading treatment. Rows are blocked/rephrased outcomes only. See [search route](../../src/app/searches/[memberId].tsx#L19-L57) and [SearchLogContent](../../src/features/integrations/SearchLogContent.tsx#L33-L87).

**Recommendation:** preserve the reporting toggle and explain exactly what is visible. Distinguish unauthorized/unavailable, loading, disabled reporting, no incidents, and failed loading. Provide retry where appropriate, and pagination/virtualization if history grows. Keep this separate from a general history of all child searches.

**Roles:** only authorized parents, not every adult. Turning reporting off must stop the subscription and remove the rows. Maintain family-timezone timestamps.

### 17. Store — P2, dependent on personal-room completion

Route: `/store`; confirmation and purchase-success overlays.

**Source-confirmed:** the kid Store has a 60pt header, five categories in one row, a fixed 236pt preview for look categories, scrolling product grid, and fixed bottom purchase bar. Adults receive an explanation that their looks are free. Selection states distinguish wearing, owned, placed, insufficient balance, and available purchase. The success overlay snapshots the purchased item correctly. See [Store route](../../src/app/store.tsx#L17-L60) and [StoreScreen](../../src/features/store/StoreScreen.tsx#L99-L224).

**Recommendation:** make preview height adaptive or collapsible, keeping a compact selected-item summary and stable purchase action visible. Preserve balance, price, and remaining-balance clarity; do not replace confirmation with immediate purchase. Furniture purchase should lead to a visible placement result. Category labels must remain understandable at large text sizes.

**States:** kid/adult/no MEGA; catalog loading/error/empty; each category; initial selection; trying/wearing/owned/in room; insufficient funds; confirmation, busy/error, success; returning to Decorate; reduced motion; short screen.

### 18. Welcome and authentication — P1

Route: `/welcome`; create-account/sign-in/demo sheets.

**Source-confirmed:** the welcome hero is a static 128×160 MEGA plus 300×190 spotlight, separate from the existing walker system. The shared sign-in frame is a flex View, and the authentication sheet is absolutely positioned without capped scrolling or keyboard avoidance. “Forgot” changes to a coming-soon/admin-help message rather than a recovery flow. See [welcome sizing/composition](../../src/app/welcome.tsx#L33), [SignInFrame](../../src/features/signin/parts.tsx#L19), [authentication sheet](../../src/features/signin/sheets.tsx#L43), [fields](../../src/features/signin/sheets.tsx#L159), and [recovery handler](../../src/features/signin/sheets.tsx#L212).

**Recommendation:** remove the oversized static hero. Stage three small characters around the wordmark and safe button ledges: greeting, passing, hopping, and reacting together without covering control hit areas. Keep account actions stable and readable. Use a capped, keyboard-aware scrolling authentication sheet. Implement a real recovery route or an honest, useful recovery alternative before treating email sign-in as complete.

**States:** landing; sign-in/create mode; Apple/Google availability; email/password; busy/error; password recovery; demo family choice; keyboard; large text; small screen; reduced motion; animation suspension when sheet/app is inactive.

### 19. Start family — P2

Route: `/start`.

**Source-confirmed:** signed-in people without a family choose Start family or Join family, with loading/error and a different-account path. The shared sign-in frame has the same overflow constraints. See [Start route](../../src/app/start.tsx) and [frame](../../src/features/signin/parts.tsx#L19).

**Recommendation:** retain the two clear choices, tighten decorative spacing, and ensure all actions remain reachable on short screens. Show progress and retry without shifting the primary choices unpredictably.

### 20. Invite entry, scanner, and join — P1 for form safety, P2 for layout

Routes: `/invite`, `/scan`, `/join/[token]`.

**Source-confirmed:** invite entry has explicit paste feedback and native QR versus web help. Its secondary native Scan card is large. Scanner has permission/invalid/found states but lacks the camera-ready/mount-error treatment already used by homework capture. Adult join includes a character preview, family roster, and actions; child join has a personal first-meeting experience and parent-code entry. Child Join is enabled before all five code digits are entered. See [Invite route](../../src/app/invite.tsx#L44-L157), [scanner](../../src/features/signin/InviteScanner.tsx#L105), [adult join](../../src/app/join/[token].tsx#L110), and [child join/code](../../src/app/join/[token].tsx#L204).

**Recommendation:** compact link entry and Scan as parallel useful paths. Reuse reliable camera startup/error UI. Shorten the adult preview while keeping family identity reassurance. The child’s first meeting can justify more character presence because the introduction is the task. Make all join forms keyboard-safe; make code completeness clear; keep invalid/expired/locked recovery adjacent to the relevant field/action.

**States:** empty/pasted/manual link; paste empty/invalid/failed; web scanner redirect; camera permission/request/denied/startup/failure/scanning/invalid/found; adult preview/edit; child first meeting/code; invalid/expired/locked token; join pending/error; wrong account; keyboard and reduced motion.

### 21. Conversational onboarding — P2

Surface: onboarding blocks inside Chat, rather than a separate route.

**Source-confirmed:** blocks include choice, toggle, text, number, date, fields, look, questions, invite, and confirmation. Date/time inputs expect typed `YYYY-MM-DD` / `HH:MM`. Connection cards already provide Not now and privacy/unavailable explanations. See [block dispatch](../../src/features/chat/Blocks.tsx#L22-L43), [date block](../../src/features/chat/Blocks.tsx#L151), and [ConnectCard](../../src/features/accounts/ConnectCard.tsx#L65).

**Recommendation:** retain conversational setup but give it a compact resumable checklist/progress summary. Use appropriate date/time entry and human-readable values. Keep only the current decision visually dominant; collapse completed setup responses. Preserve explicit skipping and consent. Long choice labels need one-column layouts when necessary.

**States:** first question; answered/locked block; validation error; saving/retry; interrupted/resumed setup; keyboard; several fields; long questions; child/adult flows; unavailable connection provider.

### 22. Talk — P1 for content/accessibility, P2 for presentation

Route: `/talk`.

**Source-confirmed:** a scale-7, 224×280 static sprite precedes headline transcript text in a centered non-scrollable group. Transcribing and sending have empty phase labels. Review supports removing mentions but not correcting transcription. The mic uses responder handlers on a View without explicit accessibility activation actions. Opening the route starts recording. See [Talk layout/controls](../../src/features/talk/TalkContent.tsx#L122-L162), [phase labels](../../src/features/talk/TalkContent.tsx#L44), and [automatic recording](../../src/app/talk.tsx#L52).

**Recommendation:** prioritize voice state, elapsed time, and transcript. Use a compact responsive character and scrollable transcript. Provide explicit Listening/Transcribing/Sending/Speaking states, Edit/Retry/Send review, and accessible tap controls alongside hold/slide gestures. Distinguish widget/deep-link intent to start recording from ordinary browsing into the screen. Preserve reliable cancellation and audio cleanup.

**States:** idle; permission; recording; locked recording; cancel; transcribing; review with/without mentions; sending; speaking; interruption/error; long transcript; screen-reader activation; reduced motion; route dismissal.

### 23. Homework capture — P2

Route: `/homework`.

**Source-confirmed:** capture uploads immediately without photo review. Camera frame uses 0.72 aspect ratio and max 470pt inside a non-scrollable screen with controls below. Permission-denied library fallback and retry already exist. See [frame](../../src/features/kids/HomeworkSnap.tsx#L72) and [capture/upload](../../src/features/kids/HomeworkSnap.tsx#L231).

**Recommendation:** fit the camera area to the viewport, keep shutter/fallback reachable, and add Retake / Use photo review before upload. Display upload progress and a recoverable failure state. Keep the existing parent/role restrictions.

**States:** unauthorized role; camera startup/live/denied/failed; photo library; capture; review; uploading/error/retry; cancellation; small-height and large-text layout.

### 24. Morning routine and child task cards — P2

Route: `/routine/morning`; related Chat cards for intro, homework, practice, routines, chores, and Bucks.

**Source-confirmed:** Morning routine reserves 230pt for character art in a non-scrollable layout. Completion emphasizes Start over without a Done/back action in that card. Failed step writes silently roll back. Bucks cards animate five sparkles indefinitely while mounted. See [MorningRoutine](../../src/features/kids/MorningRoutine.tsx#L87-L111), [step handling](../../src/app/routine/morning.tsx#L29), and [BucksCard](../../src/features/kids/BucksCard.tsx#L31).

**Recommendation:** make the current task and completion action primary, scale the character to available height, use a compact progress strip, and finish with Done/Back to Chat. Make Start over secondary. Explain failed step updates and allow retry. Use brief celebrations that settle. Offer a current-tasks entry so children can find unfinished work without searching chat history.

**States:** missing/loading/error routine; current step; optimistic completion/rollback; cheer; final completion; restart; homework reading/failed/ready; practice question/hint/answered/summary; bedtime checklist; chore due/claimed/approved/declined; Bucks receipt. Preserve the parent approval boundary for rewards and the child’s larger target/text sizing.

### 25. Connected accounts and calendar source selection — P1 for failed reconnect feedback, P2 for structure

Route: `/accounts`; phone-calendar selection and link-entry overlays; connection/reconnection/mail-found cards in Chat.

**Source-confirmed:** reconnect errors are stored in per-integration notes, but the `needs_reconnect` row does not receive the note while connected rows do. Healthy sources give maintenance controls substantial permanent space. See [account error handling](../../src/app/accounts.tsx#L52), [lapsed row](../../src/features/accounts/AccountsContent.tsx#L107), and [PhoneCalendarSheet](../../src/features/accounts/PhoneCalendarSheet.tsx).

**Recommendation:** show reconnect failure directly below Reconnect. Use compact healthy source rows with name/status/last checked and a details sheet for Sync/Disconnect. Keep broken-source recovery obvious. Distinguish unavailable provider, disconnected, lapsed permission, syncing, and failure. Retain private-data explanations and explicit source selection.

**States:** loading; connected/off/lapsed/failing; sync/reconnect/disconnect pending and results; authorization cancellation; schedule URL validation; phone-calendar permission/selection; unavailable provider; keyboard for link entry; account switch. Do not make disconnect visually equivalent to everyday sync.

### 26. Widgets — P2

Route: `/widgets`.

**Source-confirmed:** the route distinguishes web from all native platforms; native copy is iPhone-specific. The screen is primarily a paragraph rather than a guided setup. See [Widgets route](../../src/app/widgets.tsx#L9) and [widget copy](../../shared/config/copy.ts#L1027).

**Recommendation:** show small previews and short platform-specific installation steps. State unsupported-platform limitations accurately. Explain what Today/Talk widget taps do, especially whether a tap begins recording. Keep synchronization outside the visible setup UI.

### 27. Entry and infrastructure routes — retain behavior

`/` redirects according to auth/family readiness. `_layout` files provide navigation, guards, provider setup, and presentation. `+html.tsx` is web document structure, not a product screen. Keep these out of visual redesign scope except where required for proposed navigation, safe areas, focus suspension, or sheet presentation. See [entry route](../../src/app/index.tsx), [root layout](../../src/app/_layout.tsx), and [web document](../../src/app/+html.tsx).

## Embedded cards and overlays

These are user-facing surfaces even when they do not have their own route. Their shared problem is that a large card can be squeezed into the current assistant-message width, and old actionable suggestions are hard to rediscover.

| Surface | Source-confirmed states/behavior | Recommended treatment |
| --- | --- | --- |
| Event/reminder/list result cards | Chat dispatcher renders summary cards alongside richer domain cards. [Cards](../../src/features/chat/Cards.tsx#L57-L129) | Clear result receipt; open the corresponding full destination; avoid implying a read-only summary is an editor. |
| Requests and notifications | Decisions, held notices, button sets, and answered state. [Cards](../../src/features/chat/Cards.tsx) | Preserve exact decision meaning and provenance; add local busy/error; keep unresolved items available in Today. |
| Gift suggestions | Queued/failed/ready, source facts, add-to-list state, product loading/failure/no catalog, price-watch state. [GiftsCard](../../src/features/calendar/GiftsCard.tsx#L63-L107) | Full useful width; concise idea first, products on expansion; safe rediscovery in Ideas with recipient restrictions intact. |
| Product search and price drops | Loading/no results/not configured/failure; retailer links; watch active/stopped. [ProductsCard](../../src/features/shopping/ProductsCard.tsx), [PriceDropCard](../../src/features/shopping/PriceDropCard.tsx) | Separate recommendation from purchase; show live price provenance; preserve stop-watch and failed-fetch recovery. |
| Calendar sharing | Pending/shared/kept/expired, explicit Share/Keep private. [ShareSuggestionCard](../../src/features/calendar/ShareSuggestionCard.tsx) | Keep explicit consent and audience visible; never auto-share when saving to Ideas. |
| Calendar clash proposals | Pending/approved/rejected/expired/stale; only admin receives approval controls. [ProposalCard](../../src/features/calendar/ProposalCard.tsx) | Scannable before/after and responsible decision-maker; preserve state when revisited from Calendar or Ideas. |
| Holiday routine suggestions | Asked/paused/kept, pause versus keep actions. [HolidayCard](../../src/features/holidays/HolidayCard.tsx) | Keep current decision and date clear; link back to affected schedule/routine. |
| Search/weather/travel/air tips | Domain-specific result/failure handling and external-source actions. [IntegrationCards](../../src/features/integrations/IntegrationCards.tsx) | Show actionable summary first; disclose evidence/details on demand; keep unavailable results distinct from zero/no risk. |
| Connect/reconnect/mail-found | Provider setup, skip, lapsed connection, added/dismissed mail-derived items. [ConnectCard](../../src/features/accounts/ConnectCard.tsx), [ReconnectCard](../../src/features/accounts/ReconnectCard.tsx), [MailFoundCard](../../src/features/accounts/MailFoundCard.tsx) | Keep consent and source identity; make failed action state visible; allow account maintenance from Accounts. |
| Intro/homework/practice/chores/routines/Bucks | Child-specific multi-state tasks and parent approvals. [kid features](../../src/features/kids) | One current task per card, appropriate large targets, short celebrations, and persistent access to unfinished work. |
| Generic answer blocks | Choice/toggle/text/number/date/fields/look/questions/invite/confirm and answered rendering. [Blocks](../../src/features/chat/Blocks.tsx#L22-L48) | Responsive columns, keyboard-safe entry, readable completed answers, and stable disabled/pending feedback. |
| Route sheets and bottom sheets | Shared dismissal/safe areas; body content varies. [Sheet](../../src/ui/Sheet.tsx), [ModalSheet](../../src/ui/ModalSheet.tsx) | Consistent title/close/actions; test keyboard, drag/back/Escape, long content, focus return, and screen-reader order. |

## Ideas: product and backend work required

### Existing capabilities

There is no general Ideas route, general idea entity, or general Ideas API in the inspected source. Existing related systems do not collectively provide the requested feature:

| Existing system | What it offers | What it does not offer |
| --- | --- | --- |
| Gift ideas | Recipient/date, reasons/source facts, product references, queued/ready/failed status, added indexes; upcoming/get/generate/add-to-list APIs. [contract](../../shared/domain/api.ts#L624-L632), [table](../../shared/domain/tables.ts#L501-L522) | `upcoming` is ready near-future sets, not a durable archive of all useful suggestions. |
| Lists | Name, scope, optional owner; item text, checked state, author, timestamp; add/check/remove. [contract](../../shared/domain/api.ts#L543-L548) | No public list-create endpoint, source-message relationship, suggestion category/state, archive, or pin behavior. |
| Agent list tool | Finds/creates a visible family-scoped list by name. [tool](../../convex/agent/tools.ts#L92) | A direct user-facing Ideas library or explicit personal Ideas audience. |
| Memories | Notes/plans and other learned facts with recall/sharing/edit semantics. [kinds](../../shared/domain/enums.ts#L25) | Intentional saved suggestions; a memory should not silently become an idea merely because it contains a plan. |
| Chat cards/messages | Source conversations and structured domain suggestions. [message types](../../shared/domain/messages.ts) | A general index that identifies, filters, and safely acts on all useful suggestions. |

### Recommended contract

Ideas should have durable identity, title/summary, category, creator MEGA, creation/update time, source message or domain object, audience/owner, and a clear lifecycle such as suggested, saved, acted-on, dismissed, or archived. These field names and lifecycle choices are proposals to validate, not existing API guarantees.

The first view should help people review recent suggestions and saved ideas without duplicating every message. Filters should be understandable and small in number. Gifts is one category alongside other useful suggestions; categories should come from real supported content rather than an invented taxonomy. Actions such as Discuss, Save, Add to list, Schedule, or Dismiss must appear only where a backed operation exists. Opening Discuss should carry source context into Chat.

The backend needs an explicit creation/indexing rule so generic chat prose does not accidentally produce hundreds of duplicate suggestions. Decide which structured MEGA outputs qualify, how an adult manually saves a useful message, and how duplicate/domain-updated suggestions are reconciled. Loading should be paginated; an empty view should explain how suggestions arrive and how to save one.

### Privacy restrictions

- Preserve private, family, adults, and explicit-shared audiences. Saving a suggestion must not broaden its audience. The frontend must not fetch a broad family collection and rely only on visual hiding.
- Gift ideas and price watches are adult-only and exclude the intended recipient. The existing gift query enforces that boundary. See [gift queries](../../convex/gifts.ts#L22-L44).
- **Source-confirmed gap:** `gifts.addToList` copies gift text into a plain adults-scope list, while generic adult-scope visibility admits adults including an adult recipient. Recipient-specific metadata is not preserved in that copy. This can expose an adult’s surprise gift after it is saved. Treat this as a permission/data-model issue before reusing those lists in Ideas. See [gift list copy](../../convex/gifts.ts#L74-L101) and [scope visibility](../../convex/model/visibility.ts#L17-L20).
- Do not make child Ideas available by simply exposing the adult collection. Retain current child tabs until allowed categories, actions, ownership, and parent visibility are designed and tested.
- A parent’s permission to read a child’s transcript is not permission to save, share, or act as that child. Preserve existing read-only chips and actions.

## Other architecture and product gaps

| Gap | Consequence for redesign | Required work |
| --- | --- | --- |
| Generic Ideas missing | A polished empty screen cannot fulfill the request. | Define and implement scoped, paginated suggestion storage/indexing and backed actions. |
| Direct list creation missing | Empty Lists cannot recover through its own UI. | Add a permission-aware list-create operation or an explicit context-preserving chat creation flow. |
| Personal room rendering/placement missing | Store and Decorate have no visible completion loop. | Room renderer, ownership-aware placement, and save/error state. |
| Generic attachment callback missing | Composer redesign could preserve a dead control. | Implement supported attachment actions and permission/file states or omit unavailable actions. |
| Password recovery missing | Visual changes do not recover a locked-out account. | Auth recovery implementation and truthful success/error states. |
| Event detail/create flow missing from Calendar | Tapping an event violates the expected task. | Focused event details and backed create/edit actions or contextual chat handoff. |
| Several routes swallow write errors | UI cannot distinguish saved from failed. | Shared local action feedback conventions, retaining drafts and preventing duplicate submissions. |
| Memories pagination incomplete | Users can mistake an initial page for the entire collection. | Load-more behavior and accurate end/loading states. |
| True walker-to-walker interaction primitive missing | Independent scripts can stage greetings but do not coordinate mutual encounters robustly. | A bounded encounter/state mechanism if synchronized shared gestures are required. |
| Some restricted/missing records display loaders forever | The person receives no explanation or exit/recovery. | Distinct loading, missing, unauthorized, and retryable-error states. |

## Animation and performance constraints

The recent frontend performance work must remain intact. The UI redesign should make character behavior more intentional without turning every screen or old chat card into a continuously updating scene.

- Keep the query-cache bounds and cleanup already established by the performance audit. Ideas needs bounded pagination and cache behavior from its first implementation.
- Preserve optimized sprite rendering and the existing stable movement/opacity optimization. See [WalkerStage](../../src/features/walkers/WalkerStage.tsx#L190).
- HQ’s interval now stops once walkers settle. Preserve that behavior and the stable MEGA content memoization. See [HQ movement](../../src/features/hq/HqRoom.tsx#L77-L108) and [route memoization](../../src/app/(tabs)/hq/index.tsx#L127-L131).
- The sign-in stage already supports three walkers, walking/hopping/facing/speech/emotes, ledge reactions, and protected content areas. Reuse it. See [scenes](../../src/features/signin/scenes.ts#L26), [interaction engine](../../src/features/walkers/engine.ts#L199), and [content protection](../../src/features/walkers/engine.ts#L280).
- The walker stage currently has a 25Hz interval while mounted, including hidden/reduced-motion cases; add route/app visibility suspension before expanding its use. See [stage timer](../../src/features/walkers/WalkerStage.tsx#L115). Reduced motion must avoid unnecessary ongoing work as well as visible movement.
- Use short, event-driven celebrations that settle. Avoid indefinite sparkles on every historical reward card and idle pulses that ignore reduced motion.
- Keep Chat and transcripts virtualized, stable row callbacks, bounded highlight/scroll retries, and audio recording cancellation/cleanup. Long Ideas, Activity, Memories, and Lists collections should not become growing ScrollViews of mounted cards.
- Keep sprite animation state separate from form input and list data. Typing should not rerender or restart unrelated character scenes.
- Verify focus changes, background/foreground, tab revisits, sign-out/account switches, and repeated sheet openings. Preserve native modules/configuration and do not hand-edit generated native projects.

## Implementation sequence

1. **Capture the baseline and establish the shared layout.** Add runtime screenshots/notes for the current app and the critical keyboard/role states. Establish the compact header, consistent Settings gear, grouped rows, and action-feedback treatment using existing tokens.
2. **Fix the main-screen layout together.** Widen assistant content, unify the composer, resolve Attach, move streaming into the message row, keep HQ selection feedback inside the main viewport, compact the profile, expose Settings consistently, and replace the static welcome hero with coordinated walkers and scene suspension.
3. **Deliver the complete Ideas path in parallel or next.** Resolve audience rules and gift-copy leakage; build the scoped backend contract, pagination, source links, and real actions; add the proposed adult Chat/Ideas/HQ/Family navigation. Preserve the child tabs. This backend work need not delay the first layout wave.
4. **Complete focused editors and account-entry flows.** Customization/privacy, recoverable saves, keyboard-safe authentication, and real recovery.
5. **Complete family organization and personal rooms.** Actionable Today, Family shortcuts, event details, usable list creation/editing, member detail separation, visible room decoration, and a complete store-to-room loop.
6. **Refine voice, kid tasks, camera, and integrations.** Transcript-first Talk, accessible voice controls, photo review, routine completion, finite celebrations, persistent current tasks, reconnect feedback, and platform-correct widget guidance.
7. **Validate the whole product.** Role/privacy regression tests, lint/typecheck, targeted component/flow tests, visual QA, and focused performance measurements. Use actual observations to revise recommendations; do not label untested concepts as proven improvements.

## Runtime and acceptance checklist

Runtime inspection covered Chat, MEGA profile, HQ, Family, and Calendar in desktop web. HQ selection feedback was visibly below the current viewport, and Calendar selection opened location editing. The browser's responsive override did not apply, so no native-phone or keyboard validation is claimed. Every route above has been inspected in source; that is not equivalent to walking every live device state. See [evidence status](2026-10-30-design-direction.md#evidence-status).

| Area | Acceptance target to verify, not a measured result |
| --- | --- |
| Chat | Assistant cards readable at narrow widths; no composer-width shift when text appears; controls work; keyboard never hides input/action; long streaming response remains in the conversation. |
| Navigation | Adult Ideas is directly reachable; Settings is one recognizable action from each top-level screen; child tabs and permissions remain intentional. |
| HQ | Tap any target → visible contextual feedback without scrolling; close/reselect works; accessible alternative available; no idle room render loop after settling. |
| Ideas | Useful suggestions load by page; source/audience clear; gifts protected from recipient/children; save/discuss/convert actions work; no duplicates or unbounded history. |
| Profile/settings | Identity and primary actions fit initial viewport; editors are focused; failed writes preserve intent; role-limited controls remain protected. |
| Auth/invites | Email/code fields and primary actions remain reachable with keyboard and large text; recovery works; scanner has startup/failure fallback; animation never covers controls. |
| Family/Calendar/Lists/Today | Summaries open the task; empty states allow useful next action; list targets are adequate; event tap opens relevant details; action failures are visible. |
| Rooms/Store | Purchased furniture can be seen and placed; ownership reflected correctly; purchase confirmation names the actual item; small screens retain useful browsing space. |
| Voice/camera/kids | Explicit phase labels; accessible recording; transcript edit/retry; photo review; current task prominent; completion returns to a useful destination. |
| Integrations/widgets | Reconnect failures visible; connection status actionable; platform-specific instructions correct. |
| Global | 320/390/430pt, wide web/tablet, long content, keyboard, large text, all roles/themes, reduced motion, offline/error, background/foreground, tab revisits, and account switching. |

No usability or performance improvement should be stated numerically until it has been measured against the baseline under the same conditions.
