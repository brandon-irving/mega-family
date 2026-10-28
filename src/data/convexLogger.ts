// The Convex client's logger. Convex logs every failed request with console.error, which in a dev build
// raises the red error toast over the app, even for errors the app catches and shows in its own calm line
// (G4 UX review, Oct 28: `demo.signInAs` UNAUTHENTICATED covered chat and swallowed taps). Failures that are
// one of our own app error codes (convex/model/errors.ts `fail`) go to console.log; anything else, a real
// crash, is still a console.error.
import type { ConvexReactClient } from 'convex/react';
import { ERROR_CODES } from '@shared/domain/enums';

type Logger = Exclude<NonNullable<ConstructorParameters<typeof ConvexReactClient>[1]>['logger'], boolean | undefined>;

const HANDLED = new RegExp(`ConvexError[\\s\\S]*"code"\\s*:\\s*"(${ERROR_CODES.join('|')})"`);

export function isHandledServerError(args: unknown[]): boolean {
  return args.some((a) => typeof a === 'string' && HANDLED.test(a));
}

export const appConvexLogger: Logger = {
  logVerbose: () => {},
  log: (...args: unknown[]) => console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => (isHandledServerError(args) ? console.log(...args) : console.error(...args)),
};
