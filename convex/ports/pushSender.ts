// The PushSender port (CONTRACT §8; CONTRACT §5 Push notifications). Feature code (convex/proactive.ts)
// never calls Expo's push HTTP API directly — only through this interface, same discipline as ChatModel
// and Transcriber. `adapters/registry.ts` is the only file that picks the implementation.
import type { Platform } from '../../shared/domain/enums';

export interface PushMessage {
  token: string;
  platform: Platform;
  title: string;
  body: string;
  /** JSON-serializable; this is the exact shape CONTRACT §5 names (`shared/domain/api.ts` `pushData`). */
  data: Record<string, unknown>;
  /** The notification category id (CONTRACT §5) — a `ButtonSetId` from `shared/config/notifications.ts`. */
  categoryId?: string;
  /** Android only. */
  channelId?: string;
  /** iOS only, mapped from `Loudness` (CONTRACT §5). */
  interruptionLevel?: 'active' | 'passive' | 'time-sensitive' | 'critical';
  sound?: 'default' | null;
  /** iOS only (UX4, `shared/config/notifications.ts` `pushThreadIdFor`): groups notifications sharing the
   * same value into one visual stack (`aps.thread-id`) instead of each showing separately. */
  threadId?: string;
}

export interface PushSendResult {
  token: string;
  ok: boolean;
  /** Expo's `details.error` code (e.g. "DeviceNotRegistered") when `ok` is false, so the caller can decide
   * whether to prune the token. */
  error?: string;
  /** The Expo push ticket's Receipt ID (C7) — present when `ok`. Passed to `getReceipts` later (scheduled
   * ~`LIMITS.push.receiptCheckDelayMinutes` after send) to catch delivery failures that don't show up in
   * the immediate send response. */
  id?: string;
}

/** C7: the result of polling Expo's `getReceipts` for a previously-sent ticket. */
export interface PushReceiptResult {
  id: string;
  ok: boolean;
  /** Expo's `details.error` code (e.g. "DeviceNotRegistered") when `ok` is false. */
  error?: string;
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushSendResult[]>;
  /** C7: checks delivery receipts for previously-sent ticket ids (per the current Expo push docs, some
   * failures — notably `DeviceNotRegistered` — only surface here, not in the immediate send ticket). */
  getReceipts(ticketIds: string[]): Promise<PushReceiptResult[]>;
}
