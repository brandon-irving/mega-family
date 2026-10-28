// The EmailSender port (Screen 9 redesign, Oct 28): password-reset email for email + password sign-in.
// Same discipline as PushSender and ChatModel: feature code never calls an email vendor directly, and
// `adapters/registry.ts` is the only file that picks the implementation. No real provider is wired yet —
// only the log adapter — so resets don't reach anyone until one is (AUTH.passwordResetByEmail).
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
