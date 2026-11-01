# Proactive family coordination

This is phase 5 of the demo UAT follow-up. Further typography, layout, and Google setup visual refinements remain deferred while functionality is tested.

## What happens

- An email plan's live card explains who is busy at a proposed time and recommends a checked available option. Names come from the actual family members. Busy information requires the existing availability grant; private event titles and email content never appear in another member's explanation. Missing permission or stale data says availability still needs checking.
- Each recognized email-thread revision queues one update through the existing notification pipeline. It links to the original live plan card, so retries and push delivery do not duplicate cards. Holding a time and saving a draft still require their existing explicit confirmations.
- Teen connection-approval requests notify the actual parents and link to the original approve/deny block. Resolving the request suppresses pending alerts for it. No Google access is granted by a notification tap.
- A new future private teen event asks the teen whether to share it with the household. Connecting a calendar for the first time does not create a prompt for every existing event. Later imports and newly captured confirmed emails use the same sharing suggestion. Dismissing or deciding that suggestion does not cause repeated requests on re-sync.
- Once a teen event is explicitly shared, the actual parents receive a live event card so they can review it and coordinate in chat. Other adults are not treated as parents. Moving a shared event to a new time can produce a new update. Cancelling, unsharing, or removing it suppresses pending alerts. Private events never produce parent notices.

The existing notification system enforces quiet hours and daily caps. A capped notification leaves the existing chat content available. These updates have generic lock-screen previews and open the relevant chat content; no automatic calendar invitation, email send, or booking is introduced. Teens may receive their own scheduling/share updates, while unrelated child notification restrictions remain unchanged.

## Repeatable device UAT

Use Settings → Demo → Open Demo Console and the existing three-person live Gmail scenario. Use the real names selected for this run, and keep MEGA_TEST subjects.

1. Connect the admin and adult accounts using unified Google setup; grant the intended availability access.
2. Trigger the confirmed admin meeting email, followed by the adult lunch-options email. In the adult chat, confirm MEGA explains the conflict and recommends the available alternative without exposing the meeting title.
3. Background MEGA before triggering a new email. With OS notifications allowed and quiet hours off, confirm the push opens the existing plan card. Retry the same ingestion and confirm no duplicate card or alert.
4. Request Google connection approval as the teen. Switch to the parent, review the existing approval block, and confirm approving once resolves it for both parents. The teen must still complete Google consent.
5. After the teen calendar has completed its first sync, add a new future calendar event and sync, or trigger a new confirmed teen email with automatic capture enabled. The teen receives a sharing question; parents do not receive private event details.
6. Share the event explicitly. Each actual parent should receive an event card. Confirm no duplicate on another sync. Keep another event private and confirm it produces no parent alert.
7. Schedule delivery during quiet hours, then unshare/cancel the event or answer the approval request before delivery. The stale alert should not arrive.

Automated checks cover permissions, stale sources, deduplication, first-sync behavior, message reuse, private conflict explanations, lock-screen redaction, and the card's guidance. Real iOS delivery timing and notification-tap behavior require this device pass.
