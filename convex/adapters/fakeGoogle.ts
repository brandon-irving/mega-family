// Scripted Google adapters (GoogleOAuth, MailSource, CalendarSource) for tests and the safe default outside
// `MEGA_MODEL_ADAPTER=real`. Synthetic data only (hackathon rule): the inbox matches the Screen 13 board
// OnboardGmailFound (picture day, a dentist reminder, a water bill) plus one message with nothing to keep.
import type { ExternalEvent, MailMessage } from '../../shared/domain/integrationShapes';
import type { CalendarSource } from '../ports/calendarSource';
import type { GoogleOAuth } from '../ports/googleOAuth';
import type { MailSource } from '../ports/mailSource';

export const FAKE_GOOGLE_EMAIL = 'mega.demo.family@example.com';

export function makeFakeGoogleOAuth(opts: { configured?: boolean; refreshFails?: boolean } = {}): GoogleOAuth & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    configured: () => opts.configured ?? true,
    authUrl: ({ state, redirectUri, scopes }) => `https://accounts.example.test/consent?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes.join(' '))}`,
    async exchangeCode({ code }) {
      calls.push(`exchange:${code}`);
      if (code === 'bad') return { ok: false, failure: 'unauthorized' };
      return { ok: true, tokens: { accessToken: 'fake-access', refreshToken: 'fake-refresh', expiresInSeconds: 3600, scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly', 'openid', 'email'], email: FAKE_GOOGLE_EMAIL } };
    },
    async refresh() {
      calls.push('refresh');
      return opts.refreshFails ? { ok: false, failure: 'unauthorized' } : { ok: true, accessToken: 'fake-access-2', expiresInSeconds: 3600 };
    },
    async revoke() {
      calls.push('revoke');
      return { ok: true };
    },
  };
}

const NOW = Date.UTC(2026, 9, 25, 14, 0);
export const FAKE_INBOX: MailMessage[] = [
  { id: 'm1', threadId: 't1', internalDate: NOW - 3_600_000, fromName: 'Maple Elementary Office', fromAddress: 'office@maple-elementary.example.org', subject: 'Picture day is Friday, Nov 6', text: 'Reminder: school picture day is Friday, November 6. Order forms are due the day before.' },
  { id: 'm2', threadId: 't2', internalDate: NOW - 7_200_000, fromName: 'Bright Smiles Dental', fromAddress: 'reminders@brightsmiles.example.com', subject: 'Appointment reminder', text: 'This is a reminder of your appointment on Tuesday, November 3 at 3:30 PM.' },
  { id: 'm3', threadId: 't3', internalDate: NOW - 86_400_000, fromName: 'City Water', fromAddress: 'billing@citywater.example.gov', subject: 'Your water bill is ready', text: 'Amount due: $48.00. Due date: November 12, 2026.' },
  { id: 'm4', threadId: 't4', internalDate: NOW - 90_000_000, fromName: 'Newsletter', fromAddress: 'news@example.com', subject: 'Ten recipes for fall', text: 'Our favorite soups this season.' },
];

export function makeFakeMailSource(inbox: MailMessage[] = FAKE_INBOX, opts: { staleHistory?: boolean } = {}): MailSource & { requests: string[] } {
  const requests: string[] = [];
  return {
    requests,
    async profile() {
      requests.push('profile');
      return { ok: true, email: FAKE_GOOGLE_EMAIL, historyId: '1000' };
    },
    async listRecent({ max, subjectPrefix }) {
      requests.push(`listRecent:${subjectPrefix ?? ''}`);
      return { ok: true, messageIds: inbox.slice(0, max).map((m) => m.id) };
    },
    async history({ startHistoryId }) {
      requests.push(`history:${startHistoryId}`);
      if (opts.staleHistory) return { ok: true, stale: true };
      return { ok: true, stale: false, messageIds: [], historyId: String(Number(startHistoryId) + 1) };
    },
    async getMessage({ id, maxBodyChars }) {
      requests.push(`get:${id}`);
      const m = inbox.find((x) => x.id === id);
      return m ? { ok: true, message: { ...m, text: m.text.slice(0, maxBodyChars) } } : { ok: false, failure: 'no_result' };
    },
  };
}

const at = (d: number, h: number, min = 0) => Date.UTC(2026, 9, d, h + 4, min); // New York (EDT) local → UTC
export const FAKE_GOOGLE_EVENTS: ExternalEvent[] = [
  { externalId: 'g1', title: 'Team standup', start: at(26, 9), end: at(26, 9, 30), cancelled: false },
  { externalId: 'g2', title: 'Book club', start: at(28, 19), end: at(28, 20, 30), location: 'Library', cancelled: false },
  { externalId: 'g3', title: 'Flight to Denver', start: at(30, 7), end: at(30, 10), cancelled: false },
];

export function makeFakeCalendarSource(events: ExternalEvent[] = FAKE_GOOGLE_EVENTS, opts: { expireSyncToken?: boolean } = {}): CalendarSource & { requests: { syncToken?: string }[] } {
  const requests: { syncToken?: string }[] = [];
  return {
    requests,
    async listEvents({ syncToken }) {
      requests.push({ syncToken });
      if (syncToken && opts.expireSyncToken) return { ok: true, expired: true };
      return { ok: true, expired: false, events: syncToken ? [] : events, nextSyncToken: 'sync-1' };
    },
  };
}

export const defaultFakeGoogleOAuth: GoogleOAuth = makeFakeGoogleOAuth();
export const defaultFakeMailSource: MailSource = makeFakeMailSource();
export const defaultFakeCalendarSource: CalendarSource = makeFakeCalendarSource();
