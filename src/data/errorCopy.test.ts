import { ConvexError } from 'convex/values';
import { errorCopyFor } from './errorCopy';
import { ERROR_COPY } from '@shared/config/copy';
test('demo controls can show actionable validation details without changing ordinary errors', () => {
  const error = new ConvexError({ code: 'VALIDATION', message: 'Authorize demo cleanup for this account. No cleanup was started.' });
  expect(errorCopyFor(error, { validationDetails: true })).toContain('Authorize demo cleanup');
  expect(errorCopyFor(error)).toBe(ERROR_COPY.VALIDATION);
  expect(errorCopyFor(new Error('internal detail'), { validationDetails: true })).toBe(ERROR_COPY.default);
  expect(errorCopyFor(new ConvexError({ code: 'FORBIDDEN', message: 'internal detail' }), { validationDetails: true })).toBe(ERROR_COPY.FORBIDDEN);
});
