// No-flicker rule (G2 fix item 2 "Tabs remount/reflash", PLAN.md "UX quality bar": "keep the last data
// while queries refetch"): every screen-level query goes through src/data/useQuery.ts — the one wrapper
// that combines convex/react's `useQuery` with useStableQuery's last-value hold — instead of importing
// `useQuery` from 'convex/react' directly, which would bypass the no-flicker behavior for that call site.
// Greps the real src/ tree (same approach as noHardcodedColors.test.ts) so a new raw import fails CI
// instead of silently reintroducing a flash.
import { collectSourceFiles, readSourceFile, relativeToSrc } from './sourceFiles';

const CONVEX_REACT_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]convex\/react['"]/g;

/** The one file allowed to import `useQuery` from 'convex/react' — every other data hook imports the
 * wrapped version from here instead. */
const WRAPPER_FILE = 'data/useQuery.ts';

/** Test files legitimately mock convex/react's own `useQuery` directly (e.g. useMega.test.ts), and
 * fixtures/specs aren't production data-loading code. */
function isExcluded(relPath: string): boolean {
  if (relPath === WRAPPER_FILE) return true;
  if (relPath.startsWith('test/')) return true;
  if (relPath.endsWith('.test.ts') || relPath.endsWith('.test.tsx')) return true;
  return false;
}

/** Parses a `{ a, b as c, type d }` named-import clause into the bare local identifiers it introduces,
 * stripping `type` modifiers and `as` aliases down to the *source* name (what we're checking for is the
 * export being imported, not what it's renamed to). */
function namedImports(clause: string): string[] {
  return clause
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim());
}

describe("no raw convex/react `useQuery` outside the data layer's single wrapper", () => {
  test('every src/ file imports useQuery (if at all) from @/data/useQuery, not convex/react', () => {
    const violations: string[] = [];
    for (const file of collectSourceFiles()) {
      const relPath = relativeToSrc(file);
      if (isExcluded(relPath)) continue;
      const contents = readSourceFile(file);
      for (const match of contents.matchAll(CONVEX_REACT_IMPORT_RE)) {
        if (namedImports(match[1]).includes('useQuery')) violations.push(relPath);
      }
    }
    expect(violations).toEqual([]);
  });
});
