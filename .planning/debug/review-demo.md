---
status: awaiting_human_verify
trigger: "Verify review F1 F3 F4 F6 A3 A6 A7 against the current demo"
created: 2026-11-01
updated: 2026-11-01
---

## Current Focus
hypothesis: Confirmed defects are fixed locally; real demo rehearsal remains necessary after deployment.
test: 43 focused tests, repository lint and typecheck passed.
expecting: Off-script mail produces a plan, ambiguous preparation does not create people, dead worker reaches uncertain, scoped orphan cleanup works, revoked teens receive no poll jobs.
next_action: Parent integrates other agents, runs whole-suite checks and deployment; user rehearses the real flow.

## Symptoms
expected: Relevant MEGA_TEST email works outside scripted stages; preparation never invents duplicate members; cleanup is scoped; no uncertain send is retried automatically.
actual: Review reports dropped emails, duplicate personas, orphan cleanup, stale runner state and demo coupling.
errors: None supplied.
reproduction: Audit existing tests and isolated Convex mutations.
started: Unknown.

## Eliminated
- hypothesis: Default fake scheduling claims successful external writes.
  evidence: Current registry returns disabledScheduling, whose hold/draft/send all return ok:false; verify with regression test.

## Evidence
- checked: demoConsole.noteMail and acceptsMail
  found: noteMail returns false for all subjects not matching a recorded job; acceptsMail requires the active bracketed run prefix.
  implication: Legitimate off-script prefixed email is rejected before extraction.
- checked: prepare and resolveDemoPeople
  found: Multiple matching role candidates resolve undefined; prepare interprets undefined as absent.
  implication: Preparation can add a duplicate instead of requiring a persona choice.
- checked: claim
  found: Sending expiry runs only when the runner calls claim again.
  implication: A dead runner leaves sending indefinitely, blocking reset/cleanup.
- checked: cleanup discovery
  found: Calendar title search and retained exact IDs cannot discover a human-titled event whose plan record is lost.
  implication: New scripted-demo writes need explicit provenance; generic megaPlan alone cannot safely identify demo artifacts.
- checked: pollKind
  found: Connected integrations with a grant were enqueued even after teen approval revocation; execution rejected them later.
  implication: Skip before enqueue using the current timezone-aware connector gate.
- checked: focused regression execution
  found: 43 tests passed in demoConsole, demoCleanup, schedulingRegistry and g5Integrations; npm run lint and npm run typecheck passed.
  implication: Local validation passed without network writes or resets.

## Resolution
root_cause: F1 scenario bookkeeping doubled as an extraction allowlist; F3 unresolved persona ambiguity was interpreted as absence; F4 orphan events lacked demo provenance; F6 expiry depended on runner callbacks; F7 poll skipped grantless rows but not revoked members.
fix: Shared demo routing helpers admit off-script mail while retaining stale-run isolation; preparation rejects ambiguity; new demo holds carry explicit megaDemo and megaDemoRun tags and cleanup discovers only that provenance; backend send deadline plus legacy state recovery marks uncertain without resend; polling checks connector permission before enqueue. Scheduling core now calls shared demo helpers (coordinated with scheduling agent).
verification: 43 focused tests, lint and typecheck pass. No live mutations, deployment or commit. A6 default disabled adapter intentionally retained and tested fail-closed. A7 broad repair-entrypoint consolidation deferred as nonblocking refactor; cleanup uses indexed request helper.
files_changed: [convex/model/demoConsole.ts, convex/demoConsole.ts, convex/demoConsole.test.ts, convex/demoCleanup.ts, convex/adapters/demoCleanup.ts, convex/demoCleanup.test.ts, convex/adapters/googleScheduling.ts, convex/ports/mailScheduling.ts, convex/adapters/schedulingRegistry.test.ts, convex/integrations.ts, convex/g5Integrations.test.ts, docs/demo-console.md]

## Remaining limits
- Legacy orphan events with no explicit demo tag and no retained plan ID cannot safely be discovered automatically. Manual inspection is required; generic megaPlan is deliberately insufficient.
- A6 is not a live-demo bug: tests already use explicit scripted scheduling overrides; live uses real adapters. Unconfigured runtime must not pretend to write.
- A7 repair operations remain internal/demo-gated and separate by responsibility. Broad consolidation would increase risk before rehearsal and is deferred.
