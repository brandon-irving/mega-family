// CONTRACT §9. Every thrown error uses one of the fixed codes, never an ad-hoc string, so the app can
// branch on `error.data.code` instead of parsing messages.
import { ConvexError } from 'convex/values';
import type { ErrorCode } from '../../shared/domain/enums';

/** Throws `ConvexError({ code, message })`. Always `never`, so `if (!x) fail(...)` narrows `x` afterward. */
export function fail(code: ErrorCode, message?: string): never {
  throw new ConvexError({ code, message: message ?? code });
}
