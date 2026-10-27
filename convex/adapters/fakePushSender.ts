// A scripted/fake PushSender for tests and the safe default outside `MEGA_MODEL_ADAPTER=real`: no network,
// deterministic, and every call is recorded so a test can assert what was "sent" without touching Expo.
import type { PushMessage, PushSendResult, PushSender } from '../ports/pushSender';

export function makeFakePushSender(): PushSender & { sent: PushMessage[] } {
  const sent: PushMessage[] = [];
  return {
    sent,
    async send(messages: PushMessage[]): Promise<PushSendResult[]> {
      sent.push(...messages);
      return messages.map((m) => ({ token: m.token, ok: true }));
    },
  };
}

export const defaultFakePushSender: PushSender = makeFakePushSender();
