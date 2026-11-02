# Desktop experience pass

Baseline: `8b94853` on `codex/demo-phase-one`. This pass was kept uncommitted during mobile demo UAT. On November 2, the owner approved committing the accumulated changes and merging the branch into `main`.

## Scope

- Desktop starts at the centralized `DESKTOP_LAYOUT.breakpoint` (960px). Native layout selection is unchanged.
- Sidebar fixes the clipped horizontal navigation and groups primary destinations above utility actions. Role-based tab availability is preserved.
- Chat uses an 800px reading column; other screens use a 920px content column with desktop gutters.
- Family members form a two-column desktop grid.
- Route sheets receive a bounded frame; overlay sheets center on desktop and retain their bottom-sheet behavior on mobile.
- Desktop composer starts at one line and expands using browser content sizing, bounded by the existing maximum height. Native intrinsic sizing remains unchanged.

## References and decisions

- [Searchable assistant](https://mobbin.com/screens/5b1c6193-7557-47b2-9c17-f5fb0d2e10d2): persistent sidebar, secondary utility placement, constrained reading area.
- [Base44 assistant](https://mobbin.com/screens/e3c8f50f-2ee3-4140-9331-937d4ccb77d4): recognizable destinations and a focused conversation/composer column.
- Centered dialogs and the family grid are adaptations for MEGA, not copied reference features. Existing theme, type sizes, permissions, data and actions are retained.

## Verification

Typecheck and Expo lint pass. Browser checks covered Chat, Family, Ideas, HQ, Today open/close, and the Ideas filter overlay. Typed a multiline local draft to verify expansion, then cleared it without sending. No demo resets, Google permission changes, or live emails were triggered.

Desktop checked in Chrome at 1312px width. Narrow browser and physical iPhone visual verification remain for UAT. Browser content sizing requires a supporting browser; Chrome was verified. No dependencies added.

## Shared chat header follow-up

At the owner's request, the chat header now uses the supplied screenshot's centered portrait/name treatment on both desktop and mobile. Settings and Today remain on opposite sides with equal flexible columns, preserving identity centering. The solid surface band and divider are removed. The portrait size remains shared with the entrance animation so its docking target matches. This header is an intentional mobile change within the otherwise desktop-focused diff. Mobile appearance still needs device UAT.

The owner clarified that the desired Muse treatment is translucent, not opaque. The shared chat header now overlays the scrollable conversation with a theme-based tint. Its measured height pads the visual top of the inverted list so the oldest message remains fully accessible. Controls retain opaque surfaces; the entrance portrait remains measurable. No blur dependency or recurring animation was added.

## Demo controls

Desktop now puts demo identity, profile switching and the quick menu in the sidebar. Chat no longer renders the demo strip or duplicate desktop Settings/Today controls. Mobile keeps those header controls and gets a demo-only draggable launcher across the main tabs; it hides while the keyboard is open. Start/invitation recovery bars are preserved.

The quick menu reuses DemoSessionBar and DemoConsole actions, including existing reset/cleanup/Google confirmation dialogs. A recipient must return to the parked demo admin to manage resets and account authorization; the admin-only hooks are not mounted for recipient profiles. Restart story preserves connections; full onboarding remains in the full console. Cleanup still targets MEGA_TEST mail/events and tracked artifacts, not unrelated Google data. No cleanup, reset, or authorization was executed while implementing this UI.

## Desktop UAT follow-up

- Replaced generic message sheets with a compact action menu: desktop right-click/ellipsis, mobile long-press with message preview, existing up/down reactions, copy, reply and text selection. No new native dependency.
- Web Enter sends and Shift+Enter inserts a line; composition input is preserved.
- Google consent stores an allowlisted originating app address, including the demo’s 8082 origin, for both personal and centralized demo authorization.
- Demo previews stay available while delivery is offline. Worker heartbeat expires in the UI, runs independently during provider calls, and detached runner commands survive closing the terminal. Journal recovery never repeats an uncertain send.
- First-meeting introductions focus on context and goal; repeated task fields are reserved for the next proposal. Existing message history is not rewritten.

Verification: desktop right-click menu inspected in Chrome. Native menu behavior covered by component tests; phone appearance still needs UAT. Recovery tests cover network polling, failed acknowledgement, and uncertain delivery without repeats. Backend tests cover callback origin validation and heartbeat without claiming jobs.

Desktop Demo controls now opens the full shared tabbed console (People, Emails, Reset, Motion, Logs), with fixed header/tabs and one scrolling tab body. Mobile keeps its compact quick menu.
