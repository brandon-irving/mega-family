// G5 contract placeholders for the REAL adapters (`MEGA_MODEL_ADAPTER=real`) until the G5 backend writes them
// (googleOAuth.ts, gmail.ts, googleCalendar.ts, icsHttp.ts). They fail closed — `not_configured`, never a fake
// value — so a live deployment can't show made-up mail or events. The G5 backend replaces each in registry.ts and
// deletes this file; docs/gates/G5.md requires it gone at gate end.
import type { CalendarSource } from '../ports/calendarSource';
import type { GoogleOAuth } from '../ports/googleOAuth';
import type { IcsFetcher } from '../ports/icsFetcher';
import type { MailSource } from '../ports/mailSource';

const notConfigured = { ok: false as const, failure: 'not_configured' as const, detail: 'G5 adapter not built yet' };

export const unconfiguredGoogleOAuth: GoogleOAuth = {
  configured: () => false,
  authUrl: () => '',
  exchangeCode: async () => notConfigured,
  refresh: async () => notConfigured,
  revoke: async () => notConfigured,
};
export const unconfiguredMailSource: MailSource = {
  profile: async () => notConfigured,
  listRecent: async () => notConfigured,
  history: async () => notConfigured,
  getMessage: async () => notConfigured,
};
export const unconfiguredCalendarSource: CalendarSource = { listEvents: async () => notConfigured };
export const unconfiguredIcsFetcher: IcsFetcher = { fetch: async () => notConfigured };
