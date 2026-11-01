import { AccountConnectionPermissionError } from '@shared/ageGroups';
// Turns a thrown ConvexError (CONTRACT §9 error codes) or a chat.streamBody error/timeout status into
// the friendly retry line from shared/config/copy.ts, so the chat screen and talk mode show the same
// wording instead of each hand-writing one.
import { ConvexError } from 'convex/values';
import { ERROR_COPY } from '@shared/config/copy';
import type { ErrorCode } from '@shared/domain/enums';

export function errorCopyFor(err: unknown): string {
  if (err instanceof AccountConnectionPermissionError) return err.message;
  if (err instanceof ConvexError) {
    const code = (err.data as { code?: ErrorCode } | undefined)?.code;
    if (code && code in ERROR_COPY) return ERROR_COPY[code];
  }
  return ERROR_COPY.default;
}

export function streamStatusCopy(status: 'error' | 'timeout'): string {
  return ERROR_COPY[status];
}
