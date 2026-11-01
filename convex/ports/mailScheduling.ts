import type { TimeSlot } from '../../shared/domain/scheduling';
export type WriteResult = { ok: true; id: string } | { ok: false; uncertain: boolean };
export interface MailScheduling {
  watch(p: { accessToken: string; topic: string }): Promise<{ expiresAt: number } | null>;
  hold(p: { accessToken: string; id: string; planKey: string; title: string; slot: TimeSlot; confirmed: boolean; cancelled?: boolean }): Promise<WriteResult>;
  draft(p: { accessToken: string; threadId: string; to: string; subject: string; body: string; replyToMessageId?: string; messageId: string }): Promise<WriteResult>;
}
