# MEGA Demo Console — canonical demo guide

This replaces all previous sample-family, staged-price, command-line reset and ad hoc Gmail demos. Use Settings → Demo Console. Sample fixture factories in tests are not presentation tools.

## Personas

| Persona | Gmail | Age group | Family authority |
|---|---|---|---|
| Brandon, Dad | synthetictestuser91@gmail.com | Adult | Admin, Maya’s parent |
| Lovie, Mom | synthetictestuser68@gmail.com | Adult | Member, Maya’s parent |
| Maya, daughter | testusersynthetic90@gmail.com | Teen, 16 | Protected member |

Age groups are Child (0–12), Teen (13–17), Adult (18+). These are independent of administration and parental relationships. The legacy storage role `kid` supplies protected permissions for both children and teens; UI uses age-group labels. Birthday takes precedence over an explicit age group. Missing age on a legacy minor defaults to Child. Becoming older does not grant administrative permissions.

Children cannot connect accounts. Teens need a parent to approve account connections in Family → member profile. The teen then completes Google consent and chooses availability sharing. Revocation blocks new OAuth callbacks, sync, and scheduling and clears scheduling sharing. It does not erase already imported data or revoke consent at Google; disconnect accounts to remove the provider grant. Parent approval never grants access to the teen’s inbox. Google account eligibility, regional age rules and Family Link requirements still apply.

## Start the runner once

Run `npm run demo:runner` on the demo computer. The local Composio CLI must be signed in and connected to one of the three test mailboxes. The runner verifies its actual Gmail identity and the server rejects all other senders. No Composio key is bundled into the app. The runner uses the checkout’s Convex development deployment credentials; never point it at production.

`DEMO_MODE=true` must be enabled on that deployment. Keep `MEGA_GMAIL_SUBJECT_PREFIX=MEGA_TEST`. Gmail push configuration is documented in [email-scheduling.md](email-scheduling.md). Use real model adapters for a live demo.

The UI queues the configured email only after a preview and Send confirmation. The worker claims it atomically, sends exactly once through Composio, and records the result. Two taps cannot enqueue the same attempt. A lost response becomes uncertain, never an automatic retry. `.demo-runtime/delivery.json` preserves the acknowledgement across worker restarts. Do not delete the journal to force a resend.

## Rehearse entirely through the UI

1. Sign in normally as the presenter; open Settings → Demo Console → Start onboarding demo. This parks your original family and starts a new isolated family using the real onboarding conversation.
2. Introduce yourself as Brandon. Customize your MEGA. Ask it to create Lovie and Maya (16), with Maya as your daughter and Lovie as your partner. Brief Lovie’s assistant: she is new to AI, works, and is promoting a children’s book. Avoid a long interview.
3. Alternatively use Prepare Mom and Maya for rehearsal. This creates missing profiles and a proposed brief, but does not pretend they accepted or connected accounts.
4. Open Lovie’s invitation from the console, accept it, and review the brief in her actual chat. Accept the brief and wait for her MEGA’s specific first-step suggestion (for example, practical book-publicity ideas). Accept it by button or by typing “Yes, let’s do that”; verify useful research/planning/draft output. Google setup may be offered with a relevant reason, but is not required for that first task. The demo bar returns to Dad. Joined profiles can be revisited without signing out.
5. Dad approves Maya’s teen account connections from her Family profile. Open Maya’s invitation and complete the actual teen join flow, using parent code **11111**. This fixed code applies only to the presenter’s single-device child/teen invitation in an active demo, regardless of the child’s name; normal invitations retain their real family code. Maya completes her own Google consent.
6. Connect the exact configured Gmail/Calendar for each profile. Turn on recognition and optional automatic capture. Enable holds/drafts when demonstrating them. Each member explicitly selects who may check availability. For the call, Dad must share availability with Mom. No setting is silently granted by the demo console.
7. Back as Dad, inspect readiness. Every stage previews its exact recipient, subject and body. Dates use a future weekday, America/New_York, fixed at run creation. All subjects start `MEGA_TEST [run-id]`.
8. Trigger Dad’s meeting: noon–1 PM. Wait for received, plan and calendar counts.
9. Trigger Mom’s publicity call: noon or 2 PM, both parents requested. Open Mom’s chat, verify noon conflicts, and select the later time through the normal review UI. Holds are private and do not invite attendees.
10. Trigger Maya’s pickup change: 2:30–3 PM. Open Maya’s chat. Have her ask her MEGA to request pickup help from Dad. Teen requests go only to parents and cannot attach automatic actions. Dad explicitly accepts in his own chat; being available is not agreement.

## Reset and cleanup

- **Restart story** removes only the current run’s tracked MEGA plans, their owned events, and plan cards. It preserves members, conversations, Google connections and chosen permissions. New email stages get a new run id. This is a scheduling replay, not a claim that onboarding happened again.
- **Restart full onboarding** starts a new isolated family and the real first conversation. Old families remain saved; account grants are not copied. Reconnect each persona through Google. Use this for end-to-end onboarding practice.
- **Cleanup Google artifacts** deletes only recorded calendar holds (verified by their MEGA plan marker) and Gmail reply draft ids. It never sweeps a mailbox by subject. Run this before resetting a run with external artifacts. Failures block reset and are safe to retry by exact id.
- Sent scenario emails remain in Gmail as an audit trail. Old-run subjects are rejected before extraction, so they cannot contaminate a new run. The runner’s sender message id and the receiving mailbox’s message id are tracked separately.
- Return to my original family restores the presenter’s original profile. Demo data never replaces its records.

## Honest status and limits

Queued, sending, sent and uncertain describe actual delivery state. Received means the mailbox sync observed that exact run/attempt subject; plans and calendar counts are actual backend artifacts, not a timer animation. A sent email without a plan is not success. Check connection permissions, prefix, model budget and extraction failures.

The console is admin-only and DEMO_MODE-gated on the server; only its owning presenter can control a run. Persona switching is limited to real invitations redeemed by that presenter. Family tools and teen restrictions still run under the selected persona.

Provider failures can prevent the live demo. No fake delivery or seeded fallback is presented as live Gmail. The recipient may need to refresh an expired Google grant. The demo runner must stay running while using email buttons.

## Device recordings for debugging

The app automatically records an active demo on the device, including conversation message snapshots (and later edits), persona changes, named button presses, navigation, and foreground/background transitions. This is app-level instrumentation, not video recording or logging of other apps. Normal-family conversations are excluded. Switching personas keeps the same run; a reset starts a separate recording and leaves the old one available.

In Settings → Demo Console → Recordings on this device, use Refresh, then Copy recording or Share recording. The JSON includes timestamps, sequence numbers, persona, message IDs, original message times, and interaction names. Conversation snapshots can repeat when a message changes; use the latest snapshot for a message ID to reconstruct a transcript. Only conversation history fetched by this device is captured; older messages load up to 5,000 per visited persona. Unvisited personas and replies completed after leaving a persona are captured when that persona is revisited. Existing runs begin recording when the updated app first opens, not retroactively for earlier taps.

Logs stay in the app's document storage (`demo-recordings/`), or browser-local storage on web. There is no automatic upload. Exported conversations contain demo message content; authentication fields and link URLs are omitted. No audio, keystrokes, or sign-in form values are collected. Retention is 20 runs, 5,000 entries / roughly 2 million characters per run; exports report trimmed entry counts. Writes are batched for 750 ms and flushed when backgrounding. A sudden process kill can lose the last unflushed batch. Uninstalling the app deletes its local recordings.

With the development debugger connected to the phone, Codex can read the local logs using `globalThis.__MEGA_DEMO_LOGS__.list()` and `globalThis.__MEGA_DEMO_LOGS__.export(runId)`. These are read-only, asynchronous methods; the bridge exists only in development builds. If the phone is unavailable, share or paste the exported log into the debugging chat.

From this checkout, `npm run demo:logs` lists recordings on the connected MEGA phone (Metro port 8082). To save one locally, use `npm run demo:logs -- --run RUN_ID --out /tmp/mega-demo-recording.json`. It refuses to overwrite an existing export. Keep the phone unlocked with MEGA open. Use `--port` for another Metro server or `--device` when more than one MEGA device is connected. This command reads recordings only; it does not reset the demo or send email.

If the JavaScript inspector times out, use the paired-iPhone file connection instead: `npm run demo:logs -- --ios-device DEVICE_UDID`. Find the physical device with `xcrun devicectl list devices`. Add `--run RUN_ID --out /tmp/mega-demo-recording.json` to retrieve one recording. This reads only MEGA's `Documents/demo-recordings` directory and removes temporary copies after retrieval. Verified against a physical iPhone on October 31, 2026, including saved member/MEGA messages and navigation events.

Teen creation records `ageGroup` separately from the protected `kid` permission role. The creation tool accepts Child/Teen/Adult directly and preserves an explicit age at the start of a person's brief (for example, “16 yr old high schooler”). Review cards show the age group. Connecting Google checks MEGA's age/parent-approval requirements before opening consent, so a missing approval is explained as a parent step rather than a Google failure. For an older demo profile whose explicit teen age was only stored in the admin brief, the deployment-only `demoConsole:repairAgeFromBrief` operation can recover the Teen classification; it never grants connection approval.

### Names in the active demo

Brandon, Lovie, and Maya are default rehearsal names, not required profile names. The console resolves the admin from the active run and the other personas from their configured test Gmail connection, falling back to a single matching family role before connection. Ambiguous matches are not selected. Email titles, subjects, greetings, and persona labels use the resolved member names (for example, Anela). The three test mailbox addresses remain fixed. Queued emails retain a snapshot of their contents, so later profile renames do not change a queued email or break delivery tracking. Preparing rehearsal keeps existing resolved members instead of creating default-name duplicates.

### Connection setup and location confirmation

From each person's chat, open the Google connection card. Review Email & scheduling once, choose recognition and optional automatic capture, keep Calendar holds & reply drafts selected for the full scheduling demo, and select Private or Family coordination. Continue to Google once for both Gmail and Calendar. Existing complete grants do not need another sign-in. Teens can request approval from this screen; the parent answers in their own chat before the teen continues.

Newly previewed emails include the configured Orlando, Florida location. The publicity email explicitly suggests the recipient is based there; the meeting/pickup emails identify venues only. MEGA asks the recipient before remembering their inferred base privately. Existing queued emails retain their confirmed snapshots. Send a new previewed publicity email to exercise this addition; no full reset is needed, and no test emails are automatically sent by deployment.

### Creation and first-meet UAT
1. Start a MEGA draft in chat. Tap the compact draft banner → Open MEGA workshop to preview name, personality, color, and stickers. Saving updates only the draft.
2. Review to finalize. Continue chatting instead: the old card collapses, while the banner keeps the draft available. Review again and explicitly Finalize MEGA.
3. Open the invite: the selected MEGA walks in and introduces itself. Change my MEGA opens the same workshop before joining.
4. After joining, use the MEGA icon → Personalize my MEGA. Personalization is no longer a persistent chat prompt.

### First-chat entrance check
Restart the demo from onboarding (not just the email scenario), then open each profile’s chat: its own MEGA walks in, waves, and becomes the top-left logo before the greeting appears. Revisit or reload the same chat: no repeat entrance. The Open chat button skips the sequence; reduced-motion settings use a short fade. Existing conversations are never replayed. Check headings on Chat, HQ, Ideas, Family, Settings, and invitation screens with normal and enlarged system text.

### Context-based connection recommendations
The shared connection catalog ranks missing capabilities against the current task, conversation, or brief. Google is the first available adapter. New providers add catalog capabilities and a setup adapter; onboarding and chat use the same engine. The agent can call `connections_recommend` with relevant context.

A fresh admin receives an optional suggestion after introduction. Creation asks the admin whether the recipient may be offered a connection; this grants no account access. After the recipient approves their brief, their own recommendation explains the benefit and opens the existing permission review only if accepted. Under-13 profiles are excluded; teen setup retains parental approval checks. Pending and declined suggestions are not repeated, and fully connected capabilities are excluded. Manual connection setup remains available.

UAT: introduce a fresh admin, decline the connection, and verify it is not offered again. Create an adult MEGA with a book-promotion brief, approve offering a connection, then accept the brief as that person: check the explanation and separate permission review. Answer a choice card and verify its original question remains above your answer.

### Animation previews and revised chat entrance
Settings → Demo → Open Demo Console → Animation previews replays the production first-chat entrance, walking frames, or greeting wave with the current MEGA. Replay is local only and does not reset onboarding or modify entrance history. Closing the preview cancels its timers.
The first-chat entrance now uses the normal background: walk in, wave, pause with “Hi, I’m NAME!”, then float into the header and reveal chat. Spotlight removed; no Skip control. Reduced motion keeps the short fade.

### Everyday chat/family UAT
Check the empty composer is one row (+, placeholder, mic), grows for wrapped text, resets on clearing/sending, and dismisses the keyboard on send. Check each MEGA’s message hue and a teen’s text-first chat. A fresh admin can introduce “I’m Brandon and you’re Mega” and see both names persist; an existing adult can ask to rename their MEGA without a draft. In Family, choose Add without a MEGA, supply name/age group/relationship, and check the family-context entry has no assistant or invitation.

## Phase 5 coordination checks

The same scenario now exercises conversational conflict explanations and email-plan push alerts. Teen account-approval requests notify parents. Newly captured teen events ask the teen about sharing; only shared events notify actual parents. Follow [the coordination device checks](family-coordination.md#repeatable-device-uat). No additional demo/reset service is introduced. Visual refinements remain deferred.

## Email marked sent but not received

Gmail can place repetitive synthetic emails in Spam. MEGA watches Inbox; `sent` means the sender accepted the message, not that the recipient's Inbox received it. In the intended recipient test account, search `in:spam subject:MEGA_TEST` and mark the latest intended attempt Not spam. Incremental sync includes messages newly given the Inbox label, so recovery does not require a resend.

For read-only diagnosis, `demoConsole:inspectDelivery` accepts `{ runId, stage, attempt }` and checks folder labels for that exact queued email using the run recipient's existing connection. It is internal and demo-gated, returns no email body or credential, and does not move or send mail.

### Clear MEGA_TEST emails and calendar events

The admin can authorize all three fixed test accounts from Demo Console using the **Authorize [email]** controls. Permission status updates beside each persona. Google asks for each account separately; no MEGA profile switching is needed. Choosing a different Google email is rejected before storing the grant. Teen connection approval in Family remains required. Alternatively, each demo profile can open Google setup (Email and Scheduling) and choose **Authorize demo cleanup**. This explicitly requests Gmail modification and Calendar write permission through Google. It is separate from ordinary connection setup and does not delete anything. Teen connection approval is still required. Each of the three configured test accounts must grant access.

The admin then chooses **Clear MEGA_TEST emails & events** in Demo Console and confirms. Cleanup preflights all three grants, verifies the actual Gmail identity against the configured test address, moves individually verified MEGA_TEST-subject messages to Trash (including Sent and Spam), and deletes matching events from primary calendars plus exact, ownership-marked holds/drafts tracked by this family's demo runs. It does not empty Trash or delete unrelated emails/events. Other calendars are not scanned. An operation that fails partway reports its counts and can be retried.

Cleanup pauses delivery and rejects incoming messages for those runs. Choose **Restart story · keep connections** afterward to resume with a new run. The old per-run **Cleanup Google artifacts** remains available for narrow cleanup without clearing emails. No production account setup requests the new Gmail permission automatically.

### Console tabs

The fixed tab bar separates People (profiles, invitations, Google authorization), Emails (scenario previews and sending), Reset (cleanup and restarts), Motion (animation previews), and Logs (recording/export). Only the selected section is mounted; switching tabs starts its content at the top.
