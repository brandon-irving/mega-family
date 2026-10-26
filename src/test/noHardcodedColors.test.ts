// Coding standard (user's global rules: "Change behavior through config... colors... live in config, not
// hardcoded in logic"): every color is a design token (shared/config/theme.ts ThemeTokens / THEMES),
// never a literal hex in a component. Greps the real src/ tree so a new hardcoded color fails CI instead
// of silently reintroducing the duplication the G1 review found (`#FFFFFF` text-on-accent and
// `#00000088` scrim copy-pasted across 9 files).
import { collectSourceFiles, readSourceFile, relativeToSrc } from './sourceFiles';

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

/** The only allowed exceptions: the token definitions themselves (src/ui/theme*, which read
 * shared/config/theme.ts — outside src/ entirely, so never walked here anyway), and test fixtures/specs,
 * which render components with arbitrary concrete sample data for deterministic assertions, not themed
 * production UI. */
function isExcluded(relPath: string): boolean {
  if (relPath.startsWith('ui/theme')) return true;
  if (relPath.startsWith('test/')) return true;
  if (relPath.endsWith('.test.ts') || relPath.endsWith('.test.tsx')) return true;
  return false;
}

describe('no hardcoded hex colors outside shared/config and src/ui/theme*', () => {
  test('every src/ file is free of literal hex colors', () => {
    const violations: string[] = [];
    for (const file of collectSourceFiles()) {
      const relPath = relativeToSrc(file);
      if (isExcluded(relPath)) continue;
      const matches = readSourceFile(file).match(HEX_RE);
      if (matches) violations.push(`${relPath}: ${matches.join(', ')}`);
    }
    // jest's expect() (unlike vitest's) takes no custom-message argument, so the violations themselves
    // are the assertion failure's diff — each a "path: hex, hex, ..." entry pointing at the offender.
    expect(violations).toEqual([]);
  });
});
