# MEGA first-day brief

Lead the hackathon story with champion-led family assistant creation. Use a completed family coordination task as evidence of value.

## Flow

1. Creator opens Family → Add a person (or continues initial setup), adds a family member, suggests context, goal, first task and proactive priorities, then customizes and invites their MEGA.
2. Existing unjoined members can also receive a brief from their invitation panel.
3. The recipient meets their MEGA in their private chat: review, adjust, or start fresh.
4. Only an accepted brief informs the assistant. Starting the first task is a separate, explicit action through the existing agent pipeline.
5. A rejected brief offers a fresh brief, optional Gmail connection, or an explicit request for the creator’s help. Creator sees original suggestions and setup status, never private revisions.

## Implementation and verification

- Shared domain validators and copy/config; one reusable fields editor.
- Separate brief storage with family/owner authorization, transactional decisions, and idempotent chat blocks.
- Existing first meetings remain unchanged when no brief exists.
- Accepted priorities inform chat and proactive wording; accepting alone does not schedule recurring work or grant access.
- Verify creation, resume, acceptance/edit/rejection, first-task execution, repeated taps, private revisions, unauthorized reads/writes, and legacy onboarding.
- Run backend/UI checks, lint and typecheck; deploy development functions only after checks.

## Completed checks

- Convex integration tests cover review/resume, private owner edits, rejection, requested creator help, accepted task execution, natural yes/no in Talk, authorization, and duplicate answers.
- Existing UI and backend suites pass; shared field editor also has input/default/skip/busy checks.
- Browser component preview checked at 390px content width; temporary preview route removed afterward.
- Development backend updated. A fresh invite on the physical iPhone still needs end-to-end UAT; existing family sessions are not reset.

## Hackathon narrative

Lead: one family champion briefs useful personal assistants, while every recipient controls their own assistant. Proof: an accepted assistant helps resolve a shared scheduling conflict with human approval. Avoid a broad feature tour or claims that accepting a brief creates arbitrary recurring automations.
