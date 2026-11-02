# Demo readiness audit — November 1, 2026

This audit verifies the [Claude adversarial review](https://claude.ai/artifact/3Y1mM6Wuyhwf77d8FUQvSa#d5d43123-67d5) against the current implementation. The canonical presentation flow remains [Demo Console](demo-console.md).

## Functional findings

| Finding | Result |
|---|---|
| F1: Off-script email silently discarded | Fixed. Normal recognition accepts relevant `MEGA_TEST` mail without a queued scenario job. Stale bracketed run IDs remain excluded. Off-script mail does not increment scripted-stage counters. |
| F2: Minor participant can strand a shared plan | Fixed. A teen with current, registered-parent connection approval can receive and answer a scheduling request. Both chat and notification responses validate approval. Children and unapproved teens stay in an explained review state instead of an impossible confirmation loop. |
| F3: Prepare creates duplicate family members | Fixed. Ambiguous persona matches stop with guidance to connect the intended person’s configured mailbox. Preparation does not invent another person to resolve ambiguity. |
| F4: Cleanup misses orphaned demo events | Fixed for newly marked scenario events. Calendar writes retain explicit demo/run provenance, and cleanup can discover it without a surviving local plan. Legacy events with neither a reliable demo marker nor a retained reference require manual inspection. A generic MEGA plan marker is insufficient for a broad deletion sweep. |
| F5: Cancellation leaves participants uninformed | Fixed. Cancellation explains the change in participants’ own chats once and retires outstanding requests and prompts. Calendar cleanup retains its retry/error handling. |
| F6: Dead runner leaves “sending” forever | Fixed. A backend deadline makes an unacknowledged send uncertain after two minutes. Legacy expired attempts also display an actionable uncertain state. Inspect Gmail before closing an attempt; no automatic resend occurs. |
| F7: Revoked teen connections keep generating poll work | Fixed. Polling validates the current permission before enqueueing; execution still rechecks it. |
| F8: New adult-role draft can bypass age review | Fixed for conversational draft review/finalize and public family creation. New people need an explicit age category or birthday, and category/role/birthday must agree. Existing legacy records remain readable. The old saved form flow can still create an incomplete member before its details step; this compatibility path is not a new permission grant. |
| F9: Unanswered creator offer suppresses recipient suggestions | Fixed. Pending and declined are distinct. An adult recipient may receive an optional connection suggestion while the creator’s offer is unanswered. Explicit declines and minor permission requirements remain respected. |

## UI findings

| Finding | Result |
|---|---|
| U1: Current demo person unclear | Current person appears beneath the MEGA name in the chat header during a demo. |
| U2: First header measurement shifts content | Chat history waits for the current member’s header measurement instead of rendering with zero top clearance. Desktop rendering checked; physical-phone visual verification remains part of rehearsal. |
| U3: Message menu hardcodes dark colors | Menu backdrop and shadow now use theme scrim tokens. |
| U4: Raw run key dominates console header | Run key moved to Logs; the main header shows the demo date. |
| U5: Finalize has no busy/error feedback | Finalize uses shared busy/error handling and a synchronous duplicate-tap guard; failed requests become retryable. |

## Architecture and review corrections

| Finding | Result |
|---|---|
| A1: Contract tests failing | Documented all eight missing public functions: scheduling preview/send/share, request get/sync, and cleanup authorize-start/authorize-code/clear. Contract tests now report all missing names in one failure. |
| A2: Repeated environment gates | Relevant repair paths use the shared demo gate. The previous checks were already fail-closed; that security claim in the review was not reproduced. |
| A3: Demo logic mixed into scheduling | Scenario routing, stale-run isolation, and deduplication now use shared demo-model helpers called by scheduling. |
| A4: Repeated request scans | Scheduling, cancellation, and cleanup share an indexed family/plan request lookup. |
| A5: Participant calendar state tests missing | Added timeout, retry, stale completion, duplicate prevention, and cancellation-during-create tests. Existing two-calendar and cancellation flows remain covered. |
| A6: Default scheduling adapter should simulate success | Deliberately not adopted. Unconfigured external operations must fail visibly. Tests use explicit adapter overrides; a regression test verifies the default cannot claim a successful Google write. |
| A7: Consolidate all repair entrypoints | Deferred as a nonblocking refactor. Internal repair operations remain separately scoped and demo-gated. Shared request lookup was consolidated. |
| A8: Birthday checks depend on UTC | Backend and frontend use shared household-local age helpers and real time, never the demo clock. A midnight-boundary regression verifies that an eastern-US teen does not become eligible early at UTC midnight. |
| A9: Creator/recipient recommendation semantics unclear | Explicit comments and tests distinguish pending offers, declines, and permission checks. A recommendation does not grant access. |

The review also overstated the missing age display: the existing draft preview already showed a known age category. The defect was allowing a new draft to finalize without age evidence.

## Verification

- Backend: 1,193 tests passed across 96 files, including contract validation.
- Script delivery and secret-handling tests: 41 passed.
- UI: 923 tests passed across 134 suites.
- Final lint, type checking, and whitespace validation passed.
- Deployed successfully to the existing `colorless-ibis-289` development backend at 20:19 local time. No production deployment was performed.
- Post-deployment runner health: both active, unpaused demo runs had a three-second-old heartbeat, zero queued sends, and zero sends in progress.
- A stale Gmail test was corrected to assert both repeated history filters and actual inbox-label arrivals, including deduplication and exclusion of unrelated label changes.
- Navigation and account tests were updated with the demo-menu boundary, household timezone, and actual browser return origin used by the app.

Automated provider tests use controlled adapters. They do not prove live Gmail delivery or live model quality. No demo reset, new email, or new calendar write was performed for this audit.

## Final rehearsal before another feature

1. Check the console’s runner heartbeat and each person’s expected Gmail identity, recognition, calendar permission, and explicit availability sharing. Reconnect only incomplete or expired grants.
2. Send Dad’s meeting once. Wait for received and the actual calendar entry.
3. Send Mom’s publicity options once. Verify her MEGA explains the conflict conversationally, the later slot is available, and Dad receives a clear request.
4. Accept as Dad. Verify confirmation in both chats and one event on each consenting participant’s calendar. Refresh both chats to check persistence and no duplicates.
5. Send the teen pickup email once. Verify the teen’s own chat updates, parent approval is respected, and the parent receives an understandable request.
6. Cancel a rehearsal hold and confirm participants see the cancellation. Run scoped Google cleanup, then Restart story; confirm people, connections, and permissions remain available.
7. On the phone, switch between people and reopen Chat. Check initial header placement, finalize feedback, and the visible current-person label.

Use Restart full onboarding separately when rehearsing introductions and Google consent. It intentionally creates a fresh family and does not copy account grants. Record any failed rehearsal step before adding the next feature.

## November 2 UAT follow-up and merge validation

- Family coordination now persists before other family members exist. It includes future eligible members; existing explicit recipient lists remain scoped to those people.
- The chat request card's response callback is now wired to `requests.respond`. Request and notification buttons share loading/error feedback and duplicate-tap protection. The owner confirmed the Yes action works in the running app.
- Before the requested merge into `main`: 1,195 backend tests, 929 UI tests, and 41 script tests passed. Lint, type checking, and diff whitespace checks passed.
