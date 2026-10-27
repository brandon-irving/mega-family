// G3 review fix (MEDIUM): the chat header's status line used to be a literal 'Ready to help' baked
// into ChatRoute (src/app/(tabs)/chat/index.tsx). The user's "change behavior through config" rule
// means a placeholder like this comes from shared/config/copy.ts (CHAT_STATUS_PLACEHOLDER), not a
// string in the component, so swapping it (or wiring in G5's real HQ-job-event status, per STATUS.md's
// "the canvas is the spec" rule — a screen that ships as a placeholder says so in its header comment,
// along with the gate that replaces it) is a config edit, not a hunt through JSX. Reads the real source
// file rather than rendering the screen (which needs the whole Convex/auth/router stack mocked) — same
// "grep the source" pattern as src/test/noHardcodedColors.test.ts. Deliberately NOT placed under
// src/app/ itself: Expo Router treats every file there as a route, and a .test.ts file there crashes
// Metro trying to load it as one (found live, via npm run dev:web, while verifying this very fix).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHAT_STATUS_PLACEHOLDER } from '@shared/config/copy';

const SOURCE_PATH = join(__dirname, '..', '..', 'app', '(tabs)', 'chat', 'index.tsx');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

describe('chat header status line copy', () => {
  test('comes from config, not a literal string', () => {
    expect(SOURCE).not.toContain(`'${CHAT_STATUS_PLACEHOLDER}'`);
    expect(SOURCE).not.toContain(`"${CHAT_STATUS_PLACEHOLDER}"`);
    expect(SOURCE).toContain('CHAT_STATUS_PLACEHOLDER');
  });

  test('is marked as a placeholder naming the gate that replaces it (G5), per the canvas-is-the-spec rule', () => {
    expect(SOURCE).toMatch(/G5/);
  });
});
