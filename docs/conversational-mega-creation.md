# Conversational MEGA creation

People describe who the assistant is for and what might help in the normal chat composer. The agent can discuss ideas, ask one missing question at a time, and accumulate a private draft. No person, MEGA, invite, connection, or scheduled task is created during that discussion.

The agent always offers a name, color, sticker and personality preview, including self setup. The confirmation card is a review, with no text fields inside chat. A typed or spoken confirmation also works. Changing a draft invalidates earlier reviews; repeat confirmation does not duplicate a person.

## Age and teen permissions

When creating a child’s MEGA, ask how old they are unless an age or age group was already shared. Save Child (0–12), Teen (13–17), or Adult (18+); an exact birthday is not required. Review and confirmation reject minor drafts with no age group rather than silently defaulting them to Child.

For teens, ask their parent whether to allow account connections such as Gmail and Calendar or require an approval request first. Save this explicit choice as `accountConnections: allow | ask` and show it in the final review. Confirming “allow” records parental permission; the teen must still complete Google consent and choose sharing themselves. It does not connect an account or enable parent access to private chat or email. “Ask” preserves the existing teen-request/parent-approval flow. Children under 13 cannot connect accounts. Other safety controls retain their existing settings.

## Tools and shared implementation

The native agent and MCP share `creationToolSpecs.ts` and `model/creationTools.ts`:

- `mega_draft_get`: read the active draft.
- `mega_draft_update`: collect or correct details already shared in conversation.
- `mega_draft_review`: show appearance and brief for review.
- `mega_draft_cancel`: abandon the draft without creating anything.
- `mega_brief_review`: propose a recipient's private first-day revision for acceptance.
- `mega_draft_confirm`: MCP-only explicit confirmation of a reviewed revision. Native chat uses the same confirmation function from a button or recognized confirmation reply.

MCP endpoint: `POST /mcp/mega-creation` on the deployment's `.convex.site` URL. Stateless Streamable HTTP, protocol `2025-11-25`; supports initialize, ping, tools/list and tools/call. GET returns 405 (no SSE stream).

Authentication uses an existing MEGA/Convex bearer JWT. No public anonymous execution and no caller-provided family/member identity. There is not yet a separate OAuth installation flow for third-party MCP clients. Clients must be configured with a valid MEGA session. The transport enforces origin restrictions and the executor enforces family, creator, role and thread access.

Tool results include readable `content` and `structuredContent`. The optional `structuredContent.ui` follows MEGA's confirmation component schema. MEGA renders the native card; other clients can use the text summary and confirmation tool. This is a suggested component contract, not a hosted MCP Apps iframe resource.

## Ownership

A person can exist without a MEGA. A personal MEGA currently belongs to one person; self creation customizes that existing assistant. Hub is the shared family assistant. Multiple personal assistants or twin-shared assistants are not implemented by this change and would require explicit membership and private/shared-context rules.

## Proactive first conversation (phase 2)

Accepting a brief schedules one bounded, tool-free model call that proposes a concrete research, planning, or drafting task. It uses only the recipient's accepted brief and works even when there is no explicit first task. It does not execute the task, connect Google, schedule work, or share anything. The resulting review offers “Yes, let’s do that,” “Try something else,” and “Not now,” plus optional Google setup with an explanation tied to the person's goal. Under-13 recipients are never offered Google setup here.

The owner can accept using the button or continue naturally in chat. The approved brief and offered task provide context for their reply; a button acceptance uses the existing agent execution path. Changing direction while generation is pending discards the late suggestion. Reloads and retries do not duplicate it; model failure falls back to a small planning suggestion grounded in the accepted context. Creator access remains limited to the original proposed brief and acceptance status, not the recipient's private conversation or suggestion.

Test Lovie with only context about promoting her children's book: she should receive a specific proposal without a first-task interview. Accept and verify useful output; also try a typed acceptance, a different direction, and “Not now.” Email-derived location confirmation remains independent: a qualifying email can ask to remember a city/region privately, and no location memory is saved before confirmation.

Real-model synthetic smoke check: `node scripts/secrets.mjs run --only tool -- node_modules/.bin/tsx scripts/smoke/brief-kickoff.ts`. This exercises proposal generation without database writes, account access, or task execution.

## Invitations and ideas

Creation prepares an invitation; it never claims one was sent. QR codes remain available in Family → person → Invite, in addition to chat. The existing hash-only token design is preserved: a link remembered in the current app session can be reused; after restarting, Show QR code makes a fresh code without revoking previous valid codes.

Save idea appears only on an assistant reply tagged by the real `ideas_suggest` tool. Ordinary replies, greetings and setup prompts do not receive it. Message rows and block changes have no entrance/bounce animations.

## UAT

1. Family → Add a person. Type “This is for my mother.” Continue with her name and “She's a working mother; what do you think would help?” Discuss suggestions and add context before accepting a task.
2. Ask for a different name/color/sticker. Check the preview. Revise after review; an old confirmation must not create anything.
3. Skip the brief. Confirm once, then repeat. Exactly one person should exist and the invitation must say ready to share. Reopen it from Family.
4. Say “Let's create a MEGA just for me.” Customize appearance; the existing personal MEGA changes and the roster size stays the same.
5. Recipient: discuss changes in chat, review and accept. Their private revisions must not appear in the creator's view. Acceptance does not start the task or connect email.
6. Talk: hold the microphone, say “Yes please” to a current review, release, and verify an audible confirmation.
7. Start a daughter/son draft without an age. MEGA should ask how old they are. Answer “16”; MEGA should ask about account connections before review. Test both “allow” and “ask me first”: the former permits the teen to start Google consent, while the latter requires parent approval. Changing the age to under 13 must clear connection permission.

### Creation and first-meet UAT
1. Start a MEGA draft in chat. Tap the compact draft banner → Open MEGA workshop to preview name, personality, color, and stickers. Saving updates only the draft.
2. Review to finalize. Continue chatting instead: the old card collapses, while the banner keeps the draft available. Review again and explicitly Finalize MEGA.
3. Open the invite: the selected MEGA walks in and introduces itself. Change my MEGA opens the same workshop before joining.
4. After joining, use the MEGA icon → Personalize my MEGA. Personalization is no longer a persistent chat prompt.

### Context-based connection recommendations
The shared connection catalog ranks missing capabilities against the current task, conversation, or brief. Google is the first available adapter. New providers add catalog capabilities and a setup adapter; onboarding and chat use the same engine. The agent can call `connections_recommend` with relevant context.

A fresh admin receives an optional suggestion after introduction. Creation asks the admin whether the recipient may be offered a connection; this grants no account access. After the recipient approves their brief, their own recommendation explains the benefit and opens the existing permission review only if accepted. Under-13 profiles are excluded; teen setup retains parental approval checks. Pending and declined suggestions are not repeated, and fully connected capabilities are excluded. Manual connection setup remains available.

UAT: introduce a fresh admin, decline the connection, and verify it is not offered again. Create an adult MEGA with a book-promotion brief, approve offering a connection, then accept the brief as that person: check the explanation and separate permission review. Answer a choice card and verify its original question remains above your answer.

The confirmation screen uses a static portrait; only first chat plays the spotlight entrance. Cancel draft first asks for confirmation; dismissing the sheet or choosing Keep editing retains the draft.
