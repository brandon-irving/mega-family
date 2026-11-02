---
status: awaiting_human_verify
trigger: Verify adversarial review F2 F5 A2 A4 A5
created: 2026-11-01
updated: 2026-11-01
---
## Current Focus
hypothesis: Narrow authorized-teen requests plus central response authorization and cancellation notification address the confirmed mechanisms.
test: Completed focused scheduling/demo/adapter suite and notification parity tests; parent runs whole-repo checks and device UAT.
expecting: Explicit teen consent required; revocation rejects both surfaces; children stay in review; retries and cancel races remain idempotent.
next_action: Parent deploys after combined checks, then verifies teen acceptance and cancelled hold in demo UI.
## Symptoms
expected: Named authorized teen participants can accept proposed times; participants learn when a meeting is cancelled.
actual: All kid-role participants skipped in request creation but included in confirmation requirement; dismiss marks open requests done silently.
errors: No error; stalled hold.
reproduction: Include an authorized teen as another participant, select an offered time.
started: Adversarial review.
## Eliminated
- hypothesis: Repair endpoints fail open outside demo mode.
  evidence: Direct DEMO_MODE comparison already fails closed; centralization is maintainability only.
## Evidence
- Request creation skips role=kid while confirmAcceptedSelection checks every participant.
- requests.respond blanket rejects kid while notification effects call central responder without the same role guard.
- Dismiss marks requests done before calendar cancellation, with no participant-facing cancellation notice.
- Knowledge base absent.
- Authorized-teen chat and notification integration tests pass; consent remains required before confirmation.
- Child/unapproved-teen review and revoked-parent-approval rejection pass on both response APIs.
- General request notification and authenticated/background answer parity tests pass unchanged.
- Cancellation test verifies participant message exactly once, request done, and old notification retired.
- Direct participant timeout/retry test rejects stale-attempt success, preserves the latest completion across timeout, and creates only one local event.
- Direct participant in-flight cancellation test removes the late-created Google event and never announces successful attendance.
- 63 scheduling/demo/adapter tests pass; 45 scheduling/request parity tests passed before the two additional race tests. Lint passes. Typecheck identified only a separate new fixture error, now fixed by its owner.
## Resolution
root_cause: Request creation and response permissions used legacy kid-role prohibitions while plan confirmation included authorized teens. Cancellation silently closed requests. Plan-specific lookups scanned unrelated family requests.
fix: Central registered-parent authorization for teen scheduling consent; index-backed requestsForPlan; cancellation notices and retired notification prompts; centralized demo gates and scenario helpers.
verification: Focused backend tests pass, including authorized teen chat/notification consent, revoked approval, child review, cancellation notices, timeout retry and cancellation race. No deployment or live mutations performed. Whole-repo checks and user UAT delegated to parent.
files_changed: [convex/model/schedulingRequests.ts, convex/model/schedulingCoordination.ts, convex/model/scheduling.ts, convex/model/requestEffects.ts, convex/model/proactive.ts, convex/requests.ts, convex/scheduling.ts, convex/participantCalendar.ts, convex/schema.ts, convex/scheduling.test.ts]
