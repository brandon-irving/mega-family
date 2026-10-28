// Screen 9 redesign (owner, Oct 28): sign-in offers email + password next to Apple and Google. Real
// sign-ups can't run in convex-test (Better Auth runs behind the HTTP router), so these pin the options the
// server hands Better Auth and the reset-email path: there is no email provider yet, so a reset goes to the
// EmailSender port's log adapter, which must never log the reset link or token.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AUTH } from '../shared/config/auth';
import { logEmailSender } from './adapters/logEmailSender';
import { __setEmailSenderForTests, getEmailSender } from './adapters/registry';
import { emailAndPasswordOptions } from './model/authOptions';
import type { EmailMessage, EmailSender } from './ports/emailSender';

afterEach(() => {
  __setEmailSenderForTests(null);
  vi.restoreAllMocks();
});

describe('email + password options', () => {
  test('on, no email verification (no provider yet), password length from config', () => {
    const o = emailAndPasswordOptions();
    expect(o.enabled).toBe(true);
    expect(o.requireEmailVerification).toBe(false);
    expect(o.minPasswordLength).toBe(AUTH.email.minPasswordLength);
    expect(o.minPasswordLength).toBe(8);
    expect(o.maxPasswordLength).toBe(AUTH.email.maxPasswordLength);
  });

  test('a password reset goes through the EmailSender port (not awaited: no timing oracle)', async () => {
    const sent: EmailMessage[] = [];
    let release!: () => void;
    const slow: EmailSender = { send: (m) => new Promise<void>((r) => { sent.push(m); release = r; }) };
    __setEmailSenderForTests(slow);
    const o = emailAndPasswordOptions();
    // Resolves even though the sender hasn't finished.
    await o.sendResetPassword({ user: { email: 'pat@example.com' } as never, url: 'https://x/reset?token=SECRET', token: 'SECRET' });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('pat@example.com');
    expect(sent[0].text).toContain('https://x/reset?token=SECRET');
    release();
  });
});

describe('EmailSender', () => {
  test('defaults to the log adapter (no real provider is wired)', () => {
    expect(getEmailSender()).toBe(logEmailSender);
  });

  test('the log adapter never logs the link, the token or the full address', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await logEmailSender.send({ to: 'pat@example.com', subject: 'Reset your MEGA password', text: 'Open https://x/reset?token=SECRET' });
    const printed = log.mock.calls.flat().join(' ');
    expect(printed).not.toContain('SECRET');
    expect(printed).not.toContain('https://x');
    expect(printed).not.toContain('pat@');
    expect(printed).toContain('example.com');
  });
});
