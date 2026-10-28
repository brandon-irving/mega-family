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
