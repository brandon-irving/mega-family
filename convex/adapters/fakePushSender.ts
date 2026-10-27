// A scripted/fake PushSender for tests and the safe default outside `MEGA_MODEL_ADAPTER=real`: no network,
// deterministic, and every call is recorded so a test can assert what was "sent" without touching Expo.
//
// C7: also fakes the two-phase ticket/receipt flow the real `expoPushSender` uses — `send` hands out a
// fake ticket id per message and records an "ok" receipt for it by default; a test can override
// `receiptsFor[id]` before triggering the scheduled receipt check to simulate a late `DeviceNotRegistered`
// or other delivery error, exactly like a real Expo `getReceipts` response would.
import type { PushMessage, PushReceiptResult, PushSendResult, PushSender } from '../ports/pushSender';

export function makeFakePushSender(): PushSender & { sent: PushMessage[]; receiptsFor: Record<string, PushReceiptResult> } {
  const sent: PushMessage[] = [];
  const receiptsFor: Record<string, PushReceiptResult> = {};
  let nextTicketId = 0;
  return {
    sent,
    receiptsFor,
    async send(messages: PushMessage[]): Promise<PushSendResult[]> {
      sent.push(...messages);
      return messages.map((m) => {
        const id = `fake-ticket-${++nextTicketId}`;
        receiptsFor[id] = { id, ok: true };
        return { token: m.token, ok: true, id };
      });
    },
    async getReceipts(ticketIds: string[]): Promise<PushReceiptResult[]> {
      return ticketIds.map((id) => receiptsFor[id] ?? { id, ok: true });
    },
  };
}

export const defaultFakePushSender: PushSender = makeFakePushSender();
