// G4 UX review BLOCKER (Oct 28): the Convex client logs every failed request with console.error, which in a
// dev build raises the red error toast over the app — even for errors the app handles and shows calmly
// (UNAUTHENTICATED, VALIDATION, NOT_FOUND, …). Handled app errors must not reach console.error; anything
// else (a real crash) still must.
import { appConvexLogger } from './convexLogger';

let errorSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
  logSpy.mockRestore();
});

test('a handled app error (ConvexError with one of our codes) is not logged as an error', () => {
  appConvexLogger.error('[CONVEX M(demo:signInAs)] [Request ID: 1a2b] Server Error\nUncaught ConvexError: {"code":"UNAUTHENTICATED","message":"UNAUTHENTICATED"}');
  appConvexLogger.error('[CONVEX M(places:upsert)] ConvexError {\n  "code": "VALIDATION",\n  "message": "Address is required"\n}');
  expect(errorSpy).not.toHaveBeenCalled();
});

test('an unexpected server error is still logged as an error', () => {
  appConvexLogger.error("[CONVEX Q(chat:list)] [Request ID: 9] Server Error\nUncaught TypeError: Cannot read properties of undefined (reading 'x')");
  expect(errorSpy).toHaveBeenCalledTimes(1);
});
