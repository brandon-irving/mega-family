---
status: awaiting_human_verify
trigger: "Verify review F8, F9/A9 and A8; fix confirmed onboarding defects"
created: 2026-11-01
updated: 2026-11-01
---

## Current Focus
hypothesis: Missing category and pending-status suppression are confirmed; UTC birthday boundaries also differ from the household date.
test: Run onboarding regressions, timezone midnight/legacy access tests, finalize double-tap/failure UI test, lint and typecheck.
expecting: New people require reviewed age while existing records remain readable; pending offers don't grant permissions; age gates agree across backend paths.
next_action: Parent integrates full-suite checks and deploys; verify new adult/teen creation and connection offer in the live demo.

## Symptoms
expected: New people have an explicit age category reviewed; an unanswered creator recommendation does not block an adult owner indefinitely.
actual: Review reports adult fallback without age and suppression by pending creator choices.
errors: None reported.
reproduction: New adult-role draft with absent ageGroup; recipient recommendation while creator suggestion remains pending.
started: Unknown.

## Eliminated

## Evidence
- Read megaCreation.validateMinorSetup: returns before age validation whenever role is not kid.
- Read connectionRecommendations: creator status other than accepted excludes provider, including pending.
- No debug knowledge base exists.
- Failing pre-fix regression: adult-role draft with no ageGroup returned review instead of rejecting (test captured successful review payload).
- Recipient suppression test previously explicitly expected a pending creator offer to block the recipient; changed to permit one optional recipient offer while preserving explicit decline and permission gates.
- MegaDraftPreview already renders age group and parent connection choice. The review's implication that known age is absent from review UI is not supported by current code.
- Replaced backend UTC date slicing with a real-time, household-local memberAgeGroup helper. Connector entrypoints now await the same age eligibility guard.
- Finalize block had no busy/error state despite promise-returning caller chain. Uses shared action handling plus synchronous tap lock; backend already idempotent.
- Regression coverage: Maya's context "Maya is my 16-year-old daughter" plus adult role and omitted ageGroup cannot reach review or stale confirmation. Public family.add rejects omitted age and birthday/role mismatch.
- Timezone regression: at 02:00 UTC on an eighteenth birthday a New York member remains teen and unauthorized; at local midnight they become adult. Tokyo boundary also verified. Unknown legacy minors remain protected; existing adults remain readable.
- Backend focused suite: 71 tests pass across megaCreation, connectionRecommendations, ageGroups, assistantBriefs, demoProfiles and g5Onboarding.
- UI finalize busy/error/double-tap regression passes (22 Blocks tests). Family fixture timezone dependencies updated.
- Existing saved legacy form onboarding is preserved: its internal addFamilyMember call can still create a person before its details step. New conversational creation and public Family add enforce explicit age evidence; no legacy records are reclassified.

## Resolution
root_cause: Adult-role validation returned before requiring age; creator status !== accepted included pending; independent UTC date conversion advanced western-household birthday eligibility early.
fix: Require new draft/public family.add age evidence; validate birthday/role consistency; distinguish pending from declined offers; share household-local real-time backend age checks; show finalize busy/failure using shared controls.
verification: 71 focused backend tests and 22 Blocks tests pass. Lint and typecheck passed after shared helper and frontend migrations; final combined rerun pending in parent.
files_changed: [convex/model/megaCreation.ts, convex/model/familyAdd.ts, convex/model/connectionRecommendations.ts, convex/model/memberAge.ts, shared/ageGroups.ts, shared/config/megaCreation.ts, convex/family.ts, src/features/chat/Blocks.tsx, affected backend age callers and tests]
