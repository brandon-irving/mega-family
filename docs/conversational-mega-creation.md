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
