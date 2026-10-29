// The MailSource port (CONTRACT §8, G5 v0.17): read-only Gmail.
//
// Docs (developers.google.com/workspace/gmail/api, Oct 28): base https://gmail.googleapis.com/gmail/v1/users/me.
// `GET /profile` → { emailAddress, historyId }. `GET /messages?q=newer_than:30d&labelIds=INBOX&maxResults=…` for
// the first (and any full) sync. `GET /history?startHistoryId=…&historyTypes=messageAdded&labelId=INBOX&
// maxResults≤500` (default 100) for changes; the response's `historyId` is the next start. A stale/invalid
// startHistoryId → HTTP 404 → do a full sync (history ids are usually valid for at least a week, sometimes only
// hours). `GET /messages/{id}?format=full` → headers + MIME parts (base64url bodies). Auth: Bearer access token.
import type { MailMessage } from '../../shared/domain/integrationShapes';
import type { IntegrationResult } from './integrationResult';

export interface MailSource {
  profile(request: { accessToken: string }): Promise<IntegrationResult<{ email: string; historyId: string }>>;
  listRecent(request: { accessToken: string; newerThanDays: number; max: number; subjectPrefix?: string }): Promise<IntegrationResult<{ messageIds: string[] }>>;
  /** `stale: true` = Google answered 404 for the start id: the caller does a full sync. */
  history(request: { accessToken: string; startHistoryId: string; max: number }): Promise<IntegrationResult<{ messageIds: string[]; historyId: string; stale: false } | { stale: true }>>;
  getMessage(request: { accessToken: string; id: string; maxBodyChars: number }): Promise<IntegrationResult<{ message: MailMessage }>>;
}
