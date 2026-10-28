// Sign-in settings (Screen 9 redesign, owner Oct 28: email + password next to Apple and Google). The
// server reads the email rules (convex/model/authOptions.ts) and the sign-in sheet reads the same numbers,
// so the "Use 8 or more characters" line and the server's check can't disagree.
export const AUTH = {
  email: {
    minPasswordLength: 8,
    maxPasswordLength: 128,
    /** Better Auth requires a display name on sign-up; until onboarding asks, it's the email's local part,
     * cut to this length. */
    maxDerivedNameLength: 40,
  },
  /** Password reset needs a real email provider behind the EmailSender port; until one is wired, the app
   * shows a placeholder instead of a reset form (src/features/signin/sheets.tsx). */
  passwordResetByEmail: false,
} as const;
