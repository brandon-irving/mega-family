// Product copy for things that go wrong, so a friendly line is a config edit, not a string baked into
// a component (user's "change behavior through config" rule). Keyed by CONTRACT §9 error codes, plus
// the two non-`done` chat.streamBody statuses (CONTRACT §4 `chat.streamBody`).
import type { ErrorCode } from '../domain/enums';

export type RetryCopyKey = ErrorCode | 'error' | 'timeout' | 'default';

/** G3 review fix (MEDIUM): the chat header's status line is a placeholder — its live version comes from
 * HQ job events in G5 (not built yet; see the header comment at the call site,
 * src/app/(tabs)/chat/index.tsx, and ChatHeader.tsx). A config string, not a literal in the component,
 * per "change behavior through config" — swapping in the real copy later (or restyling it) is a config
 * edit at the call site, not a hunt through JSX. */
export const CHAT_STATUS_PLACEHOLDER = 'Ready to help';

export const ERROR_COPY: Record<RetryCopyKey, string> = {
  UNAUTHENTICATED: "You've been signed out. Sign in again to keep chatting.",
  NOT_A_MEMBER: "That didn't go through — try again in a moment.",
  FORBIDDEN: "I can't do that one.",
  NOT_FOUND: "I couldn't find that anymore.",
  INVALID_INVITE: 'That invite link has expired or was already used.',
  WRONG_PARENT_CODE: "That parent code didn't match.",
  RATE_LIMITED: "That's a lot of tries — give it a moment and try again.",
  BUDGET_EXCEEDED: "I've used up today's budget for the family. Try again tomorrow.",
  KID_BLOCKED: "I can't help with that one. Ask a grown-up.",
  VALIDATION: "That didn't look right — want to try again?",
  error: 'Something went wrong on my end.',
  timeout: 'That took too long to come back.',
  default: 'Something went wrong. Want to try again?',
};

/** GD (CONTRACT v0.13): the agent-identity disclosure on every clash proposal (brief: the agent's identity
 * is disclosed). `{mega}` is the family MEGA's name. */
export const PROPOSAL_DISCLOSURE = '{mega} · your family\u2019s MEGA (AI). Nothing changes until Admin approves.';
/** The line under the share suggestion and on private events (Screen 12). */
export const SHARE_RULE_COPY = 'MEGA never shares anything unless you tap Share.';

/** GD backend: the deterministic headline + body for each card-backed push (convex/model/proactive.ts
 * `enqueueCardCandidate`). The model already wrote the card's real content (a proposal, a practice set, gift
 * ideas); these are just the lock-screen line, so they're templates, not model calls. `{x}` slots are filled
 * with plain values from the row (`fillCopy`). */
export const GD_PUSH_COPY = {
  choreRemind: { title: '{chore}', text: 'Time for {chore}. Tap Done when it’s finished.' },
  choreApprove: { title: '{kid} finished {chore}', text: '{kid} says {chore} is done. Release {bucks} Mega Bucks?' },
  practiceReady: { title: 'Practice time', text: '{topic} practice is ready. {count} questions. You’ve got this!' },
  practiceSummary: { title: '{kid} finished practice', text: '{kid} got {correct} of {total}. {note}' },
  bucksReleased: { title: '{bucks} Mega Bucks!', text: '{by} released {bucks} Mega Bucks. You have {balance} now.' },
  routineMorning: { title: 'Good morning', text: 'Your morning list is ready. One step at a time.' },
  routineBedtime: { title: 'Ready for tomorrow?', text: 'A few things to get ready for tomorrow.' },
  shareSuggestion: { title: 'Share with the household?', text: '{preview}. Right now only you can see it.' },
  proposal: { title: '{title}', text: '{text}' },
  proposalApplied: { title: 'Calendar updated', text: '{title}. Approved by {by}.' },
  gifts: { title: 'Gift ideas for {name}', text: '{name}’s birthday is {when}. Here are a few ideas from what’s been shared.' },
} as const;

/** Fills `{key}` slots in a GD_PUSH_COPY template. Unknown slots become empty, never "undefined". */
export function fillCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (values[k] === undefined ? '' : String(values[k]))).trim();
}

/** The adults-scope list `gifts.addToList` adds to (created on first use). */
export const GIFT_LIST_NAME = 'Gift ideas';
