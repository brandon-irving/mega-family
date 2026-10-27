/// <reference types="vite/client" />
// G3 security/UX review S5 (lock-screen redaction) + UX4 (quiet grouping): `buildPushMessages`
// (convex/model/proactive.ts) decides the push payload's body and `threadId` per notification kind and
// trigger source. Unit-tested directly against the pure function — no DB, no model, deterministic.
import { describe, expect, test } from 'vitest';
import { buildPushMessages } from './model/proactive';
import type { Id } from './_generated/dataModel';

const threadId = 'threads|1' as Id<'threads'>;
const messageId = 'messages|1' as Id<'messages'>;
const megaId = 'megas|1' as Id<'megas'>;
const tokens = [{ token: 'ExponentPushToken[t]', platform: 'ios' as const }];

function notification(kind: 'reminder' | 'request' | 'tip' | 'update', body: string) {
  return { _id: 'notifications|1' as Id<'notifications'>, kind, body, buttons: [], loudness: 'passive' as const, megaId };
}

describe('S5: lock-screen redaction — the push BODY (never the stored notification/thread content)', () => {
  test('a mattersTo-sourced tip sends a generic push body, hiding the relayed content from the lock screen', () => {
    const [msg] = buildPushMessages(notification('tip', 'Partner said we are out of milk.'), 'Teal', threadId, messageId, tokens, '', 'mattersTo');
    expect(msg.body).toBe('Teal has a message for you');
    expect(msg.body).not.toContain('milk');
  });

  test('a mattersTo-sourced update is also redacted', () => {
    const [msg] = buildPushMessages(notification('update', 'Partner mentioned something personal.'), 'Teal', threadId, messageId, tokens, '', 'mattersTo');
    expect(msg.body).toBe('Teal has a message for you');
  });

  test('a reminder is NEVER redacted, even if it somehow had a mattersTo source', () => {
    const [msg] = buildPushMessages(notification('reminder', 'Return the library book'), 'Sunny', threadId, messageId, tokens, '', 'mattersTo');
    expect(msg.body).toBe('Return the library book');
  });

  test('a request is NEVER redacted', () => {
    const [msg] = buildPushMessages(notification('request', 'Can you grab oat milk?'), 'Teal', threadId, messageId, tokens, '', 'mattersTo');
    expect(msg.body).toBe('Can you grab oat milk?');
  });

  test('a tip NOT sourced from mattersTo (e.g. a daily check-in style tip) stays full text', () => {
    const [msg] = buildPushMessages(notification('tip', 'Recycling goes out Tuesday.'), 'Teal', threadId, messageId, tokens, '', 'checkin');
    expect(msg.body).toBe('Recycling goes out Tuesday.');
  });

  test('a legacy notification with no backing candidate (sourceKind undefined) stays full text', () => {
    const [msg] = buildPushMessages(notification('tip', 'Recycling goes out Tuesday.'), 'Teal', threadId, messageId, tokens, '', undefined);
    expect(msg.body).toBe('Recycling goes out Tuesday.');
  });
});

describe('UX4: quiet grouping — threadId (iOS) per MEGA for quiet kinds, none for loud kinds', () => {
  test('a tip groups under the MEGA (perMega)', () => {
    const [msg] = buildPushMessages(notification('tip', 'x'), 'Teal', threadId, messageId, tokens, '', 'checkin');
    expect(msg.threadId).toBe(`mega:${megaId}`);
  });

  test('an update groups under the MEGA too', () => {
    const [msg] = buildPushMessages(notification('update', 'x'), 'Teal', threadId, messageId, tokens, '', 'checkin');
    expect(msg.threadId).toBe(`mega:${megaId}`);
  });

  test('a reminder is never grouped — it should stand out on its own', () => {
    const [msg] = buildPushMessages(notification('reminder', 'x'), 'Teal', threadId, messageId, tokens, '', 'reminder');
    expect(msg.threadId).toBeUndefined();
  });

  test('a request is never grouped', () => {
    const [msg] = buildPushMessages(notification('request', 'x'), 'Teal', threadId, messageId, tokens, '', 'request');
    expect(msg.threadId).toBeUndefined();
  });
});
