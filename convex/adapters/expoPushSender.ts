// The real PushSender adapter (CONTRACT §5; PLAN.md -> Push). POSTs to Expo's push service HTTP API
// (https://docs.expo.dev/push-notifications/sending-notifications/, fetched Oct 26) in batches of up to 100
// messages — no SDK, just `fetch`, same discipline as `metaChatModel.ts`.
//
// Receipt handling: Expo's docs describe two places a dead token shows up — directly in the *send* response
// ticket ("DeviceNotRegistered" in `details.error`), or ~15 minutes later in a separate `getReceipts` poll.
// This handles the first (immediate) case, which is also the one this build can actually exercise (no real
// device token exists yet — STATUS.md). Polling receipts 15 minutes after every send is a documented gap
// for whichever gate first has a real device registered.
import type { PushMessage, PushSendResult, PushSender } from '../ports/pushSender';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

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
        if (ticket?.status === 'ok') results.push({ token: batch[i].token, ok: true });
        else results.push({ token: batch[i].token, ok: false, error: ticket?.details?.error ?? ticket?.message ?? 'unknown Expo push error' });
      }
    }
    return results;
  },
};
