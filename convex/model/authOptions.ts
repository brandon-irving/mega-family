// Better Auth's email + password options (Screen 9 redesign, Oct 28), split out of convex/auth.ts so they
// can be tested without the HTTP router. Shape per the current Better Auth docs (`emailAndPassword`:
// enabled, requireEmailVerification, min/maxPasswordLength, sendResetPassword). Verification is off: there's
// no email provider yet, and an unverified address only ever reaches the "start or join a family" screen.
import { AUTH } from '../../shared/config/auth';
import { getEmailSender } from '../adapters/registry';

export function emailAndPasswordOptions() {
  return {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: AUTH.email.minPasswordLength,
    maxPasswordLength: AUTH.email.maxPasswordLength,
    // Better Auth docs: don't await the send (it would make response time reveal whether the address has an
    // account). The log adapter is the only sender until a provider is wired (AUTH.passwordResetByEmail).
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string; token: string }) => {
      void getEmailSender()
        .send({ to: user.email, subject: 'Reset your MEGA password', text: `Open this link to choose a new password: ${url}` })
        .catch((e: unknown) => console.error('[auth] reset email failed:', (e as Error).message));
    },
  };
}
