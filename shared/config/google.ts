// G5 (CONTRACT v0.17): Google (Gmail + Google Calendar) as read-only integrations. Owned by the backend, read by
// both. Docs checked Oct 28 (developers.google.com: OAuth 2.0 web server flow, Gmail users.history.list /
// users.messages.get / sync guide, Calendar events.list / sync guide; Google Cloud "Testing" publishing status).
//
// A Google *integration* is its own OAuth grant, separate from signing in: the account MEGA reads mail from can
// differ from the one you sign in with (the demo reads a synthetic Gmail account while the owner signs in with
// their own). So tokens live in our `integrationSecrets` table (server-only, encrypted), not Better Auth's
// account rows, and there's no `linkSocial`. Web uses Google's redirect flow to our Convex HTTP callback; iOS uses
// the installed @react-native-google-signin (offlineAccess → `serverAuthCode`, exchanged on the server).

export const GOOGLE = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
  /** Read-only scopes only. `gmail.readonly` is a *restricted* scope (fine in Testing mode; production needs
   * verification + a security assessment); `calendar.readonly` is *sensitive*. */
  scopes: {
    gmail: 'https://www.googleapis.com/auth/gmail.readonly',
    googleCalendar: 'https://www.googleapis.com/auth/calendar.readonly',
  },
  /** Always asked with the scopes so Google returns the account's address (shown in Settings: "Connected as …"). */
  identityScopes: ['openid', 'email'],
  /** Our HTTP routes on the Convex site URL (`CONVEX_SITE_URL`); the callback is the redirect URI registered on
   * the Web client in Google Cloud. */
  callbackPath: '/google/oauth/callback',
  /** Where the callback sends the browser afterwards (`SITE_URL` + this, `?google=connected|failed&what=gmail`). */
  returnPath: '/chat',
  /** Env vars (set with scripts/secrets.mjs, never in the repo). The web client id/secret already exist for
   * Sign in with Google; the iOS client id is the native one. `INTEGRATION_TOKEN_KEY` is a 32-byte base64url key (`node scripts/secrets.mjs gen INTEGRATION_TOKEN_KEY`)
   * for AES-GCM encryption of refresh tokens at rest; without it Google integrations are `not_configured`. */
  env: {
    webClientId: 'GOOGLE_WEB_CLIENT_ID',
    iosClientId: 'GOOGLE_IOS_CLIENT_ID',
    clientSecret: 'GOOGLE_CLIENT_SECRET',
    tokenKey: 'INTEGRATION_TOKEN_KEY',
    /** Optional deployment setting (not a secret): when set, Gmail reads only mail whose subject starts with it
     * (case-insensitive) and strips it before anything sees the subject. The demo inbox uses MEGA_TEST so it can
     * hold other projects' test mail; unset for real families. */
    subjectPrefix: 'MEGA_GMAIL_SUBJECT_PREFIX',
  },
  /** The OAuth `state` row lives this long (one consent screen). */
  stateTtlMinutes: 15,
  /** Testing mode: grants for non-basic scopes expire after 7 days. MEGA asks to reconnect when a refresh fails
   * with `invalid_grant`, and nudges this many hours before the expected lapse. */
  testingGrantDays: 7,
  reconnectNudgeHours: 12,
  /** Refresh an access token this long before Google's `expires_in` runs out. */
  refreshSkewSeconds: 120,
  timeoutMs: 10_000,
} as const;

export const GMAIL = {
  baseUrl: 'https://gmail.googleapis.com/gmail/v1/users/me',
  /** Polling from a Convex cron (users.watch + Pub/Sub is a post-deadline upgrade, PLAN.md Integrations row 7). */
  pollMinutes: 10,
  /** First sync (and a full resync after a 404 on a stale historyId): recent messages via `messages.list`
   * with `q: newer_than:{firstSyncDays}d`, newest first. */
  firstSyncDays: 30,
  /** Only the inbox; history.list `labelId` + `historyTypes: messageAdded`. */
  labelId: 'INBOX',
  /** history.list page size (`maxResults`). */
  historyMaxResults: 100,
  /** v0.17b (C1): a history pass reads at most this many pages; past that (or past the queue's room) it is a full
   * resync instead of a half-read cursor. */
  historyMaxPages: 10,
  /** Cap per poll so one busy inbox can't run up model spend; the rest waits for the next poll. */
  maxMessagesPerPoll: 20,
  /** messages.get `format: full`; we keep only From (display name), Subject, Date and the plain-text body, cut
   * to this many characters, for the extraction call. Bodies are never stored. */
  maxBodyChars: 4000,
  maxItemsPerMessage: 3,
  /** Senders whose mail is never read past the headers (security codes, banks' one-time passwords). Matched
   * case-insensitively against the From address. Config, so tuning it is an edit here. */
  skipSenderPatterns: ['no-reply@accounts.google.com', 'verify', 'security', 'otp'],
  /** G5 backend: a found bill/delivery/reminder with a date but no time becomes a private reminder at this
   * local time on that date. */
  reminderAt: '09:00',
  /** Found dates outside [today, today + maxAheadDays] are dropped (already past, or a misread year). */
  maxAheadDays: 366,
  /** How many processed message ids to remember (so a full resync after a stale history id doesn't re-read
   * the same mail through the model). Ids past the per-poll cap wait in a queue for the next poll. */
  seenMemory: 500,
  pendingMax: 200,
} as const;

/** G5 backend: sync bookkeeping shared by every integration kind. */
export const INTEGRATION_SYNC = {
  /** `integrations.syncNow` at most this often per integration. */
  syncNowMinSeconds: 60,
  /** Expired/used OAuth `state` rows are deleted by a cron this often. */
  stateCleanupMinutes: 60,
  /** v0.17b (C4): one sync per integration at a time; a sync that dies without releasing frees it after this. */
  leaseSeconds: 180,
} as const;

export const GOOGLE_CALENDAR = {
  baseUrl: 'https://www.googleapis.com/calendar/v3',
  calendarId: 'primary',
  pollMinutes: 30,
  /** The first (full) sync's window (`timeMin`/`timeMax`, `singleEvents: true`); later polls send only
   * `syncToken` + `singleEvents` (Google forbids timeMin/timeMax/updatedMin/orderBy/q with a sync token), get
   * changes incl. cancelled events, and drop anything outside this window on our side. 410 Gone → clear the
   * token and full-sync again. */
  pastDays: 7,
  futureDays: 60,
  /** At most this many events are applied per sync; v0.17b (C5): paging still runs to the page that carries
   * `nextSyncToken` (the extra events are dropped), at most `maxPages` pages. */
  maxEvents: 500,
  maxPages: 20,
} as const;
