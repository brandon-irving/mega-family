// The development EmailSender: sends nothing, logs that an email would have gone out. A reset email
// carries a working sign-in link, so the log line never includes the body, the link or the full address —
// only the subject and the recipient's domain.
import type { EmailSender } from '../ports/emailSender';

export const logEmailSender: EmailSender = {
  async send({ to, subject }) {
    const domain = to.includes('@') ? to.slice(to.lastIndexOf('@') + 1) : 'unknown';
    console.log(`[email] not sent (no provider wired): "${subject}" to a recipient at ${domain}`);
  },
};
