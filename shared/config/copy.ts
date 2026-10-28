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

/** The sign-in screens (Screen 9 boards, approved Oct 26; wordmark and tagline Oct 27). The wordmark and the
 * one tagline come from IDENTITY (shared/config/identity.ts), never repeated here. */
export const SIGNIN_COPY = {
  welcome: { make: 'Make my MEGA', invite: 'I have an invite', haveAccount: 'Already have an account?', signIn: 'Sign in', demo: 'Demo' },
  sheet: { title: 'Sign in to save your family', google: 'Continue with Google', privacy: 'MEGA only gets your name and email.', close: 'Close' },
  demo: { title: 'Demo accounts', badge: 'Dev builds only', sub: (megaName: string, role: string) => `${megaName} · ${role}` },
  invite: {
    title: 'I have an invite',
    // QR scanning is designed (LoginScan board) and built with expo-camera in G8; until then, paste only.
    body: 'Paste the link your family admin sent you, or just its code.',
    label: 'Invite link',
    placeholder: 'mega.family/join/…',
    cont: 'Continue',
    back: 'Back',
  },
  join: {
    eyebrow: 'You’re invited',
    title: 'Join the family',
    body: 'Hub is your family’s shared MEGA. Next, you’ll make your own.',
    kidHint: 'Kids: ask a grown-up to type the 5-digit parent code. Grown-ups can leave it blank.',
    codeLabel: 'Parent code',
    codePlaceholder: '5 digits (kids only)',
    action: 'Join the family',
    greeting: 'Welcome!',
  },
  locked: { title: 'This invite is locked', body: 'The parent code was wrong 5 times. Ask a grown-up to send you a new invite.', action: 'Use a new invite' },
  family: {
    title: 'Let’s set up your family',
    body: 'You’re signed in. Start a new family, or join the one that invited you.',
    start: 'Start a family',
    startBody: 'Make your MEGA, then add everyone.',
    join: 'Join a family',
    joinBody: 'Use the invite link from your family’s admin.',
  },
  differentAccount: { prompt: 'Not you?', action: 'Use a different account' },
  sayHi: (name: string) => `Hi! I’m ${name}.`,
  sayHiLabel: (name: string) => `${name}, say hi`,
  failed: 'Something went wrong. Try again.',
} as const;
