import { expect, test } from 'vitest';
import { briefIntroduction } from './assistantBrief';
test('recipient introduction leaves repeated task details for the next step', () => {
  const result = briefIntroduction({ context: 'School, cheer and piano.', goal: 'Keep the week manageable.', firstTask: 'Send a daily joke', proactive: 'Share a daily joke' });
  expect(result).toContain('School, cheer and piano.');
  expect(result).toContain('Keep the week manageable.');
  expect(result).not.toContain('daily joke');
  expect(result).not.toContain('Helpful context:');
});
