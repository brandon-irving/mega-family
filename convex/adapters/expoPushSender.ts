// The real PushSender adapter (CONTRACT §5; PLAN.md -> Push). POSTs to Expo's push service HTTP API
// (https://docs.expo.dev/push-notifications/sending-notifications/, fetched Oct 26) in batches of up to 100
// messages — no SDK, just `fetch`, same discipline as `metaChatModel.ts`.
//
// Receipt handling (C7): Expo's docs describe two places a dead token shows up — directly in the *send*
// response ticket ("DeviceNotRegistered" in `details.error`), or ~15 minutes later in a separate
// `getReceipts` poll (https://exp.host/--/api/v2/push/getReceipts, `{ ids: string[] }` ->
// `{ data: { [receiptId]: { status, message?, details? } } }`, fetched Oct 26). `send` returns each ok
// ticket's Receipt ID; `convex/proactive.ts`'s `sendPush` schedules `checkPushReceipts` ~`LIMITS.push.
// receiptCheckDelayMinutes` later to call `getReceipts` and prune/log from the real result.
import type { PushMessage, PushReceiptResult, PushSendResult, PushSender } from '../ports/pushSender';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const BATCH_SIZE = 100;
const RECEIPT_BATCH_SIZE = 1000; // Expo's documented max ids per getReceipts call

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const expoPushSender: PushSender = {
  async send(messages: PushMessage[]): Promise<PushSendResult[]> {
    if (messages.length === 0) return [];
    const results: PushSendResult[] = [];

    for (const batch of chunk(messages, BATCH_SIZE)) {
      const body = batch.map((m) => ({
        to: m.token,
        title: m.title,
        body: m.body,
        data: m.data,
        sound: m.sound ?? 'default',
        priority: 'high' as const,
        categoryId: m.categoryId,
        channelId: m.channelId,
        interruptionLevel: m.interruptionLevel,
        threadId: m.threadId,
      }));

      let tickets: ExpoTicket[];
      try {
        // EXPO_ACCESS_TOKEN (scripts/env.manifest.json, gate G3) is optional — only needed if the project
        // has Expo's "enhanced push security" turned on. Unset means Expo accepts the request without it.
        const accessToken = process.env.EXPO_ACCESS_TOKEN;
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(body.length === 1 ? body[0] : body),
        });
        const json = (await res.json()) as { data?: ExpoTicket | ExpoTicket[]; errors?: { message: string }[] };
        if (!res.ok || json.data === undefined) {
          const message = json.errors?.[0]?.message ?? `Expo push HTTP ${res.status}`;
          for (const m of batch) results.push({ token: m.token, ok: false, error: message });
          continue;
        }
        tickets = Array.isArray(json.data) ? json.data : [json.data];
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        for (const m of batch) results.push({ token: m.token, ok: false, error: message });
        continue;
      }

      for (let i = 0; i < batch.length; i++) {
        const ticket = tickets[i] as ExpoTicket | undefined;
        if (ticket?.status === 'ok') results.push({ token: batch[i].token, ok: true, id: ticket.id });
        else results.push({ token: batch[i].token, ok: false, error: ticket?.details?.error ?? ticket?.message ?? 'unknown Expo push error' });
      }
    }
    return results;
  },

  async getReceipts(ticketIds: string[]): Promise<PushReceiptResult[]> {
    if (ticketIds.length === 0) return [];
    const results: PushReceiptResult[] = [];
    for (const batch of chunk(ticketIds, RECEIPT_BATCH_SIZE)) {
      try {
        const res = await fetch(EXPO_RECEIPTS_URL, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: batch }),
        });
        const json = (await res.json()) as { data?: Record<string, { status: 'ok' | 'error'; message?: string; details?: { error?: string } }>; errors?: { message: string }[] };
        if (!res.ok || json.data === undefined) {
          const message = json.errors?.[0]?.message ?? `Expo getReceipts HTTP ${res.status}`;
          for (const id of batch) results.push({ id, ok: false, error: message });
          continue;
        }
        for (const id of batch) {
          const receipt = json.data[id];
          if (!receipt || receipt.status === 'ok') results.push({ id, ok: true });
          else results.push({ id, ok: false, error: receipt.details?.error ?? receipt.message ?? 'unknown Expo receipt error' });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        for (const id of batch) results.push({ id, ok: false, error: message });
      }
    }
    return results;
  },
};
