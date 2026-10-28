// Owner, Oct 28: "make sure all screens use safe area spacing". Every route under src/app renders inside one
// of the shared safe-area wrappers, so nothing sits under the status bar, the notch or the home indicator:
//   Screen      full screens (src/ui/Screen.tsx)
//   Sheet       modal sheets (src/ui/Sheet.tsx)
//   SignInFrame the sign-in screens (src/features/signin/parts.tsx)
// Layouts, +html, pure re-exports and Redirect-only routes don't draw anything of their own.
import { join } from 'node:path';
import { collectSourceFiles, readSourceFile, relativeToSrc, SRC_ROOT } from './sourceFiles';

const WRAPPERS = ['Screen', 'Sheet', 'SignInFrame'] as const;

function isRouteThatDraws(rel: string, src: string): boolean {
  const name = rel.split('/').pop() ?? '';
  if (name.startsWith('_layout') || name.startsWith('+') || /\.test\.tsx?$/.test(name)) return false;
  if (/^export \{ default \} from/m.test(src)) return false; // same screen, another URL
  if (/<Redirect\b/.test(src) && !/return \(\s*</.test(src.replace(/return <Redirect[^;]*;/g, ''))) return false;
  return true;
}

describe('every route uses safe-area spacing', () => {
  const routes = collectSourceFiles(join(SRC_ROOT, 'app')).map((f) => ({ rel: relativeToSrc(f), src: readSourceFile(f) }));

  test.each(routes.filter((r) => isRouteThatDraws(r.rel, r.src)).map((r) => [r.rel, r.src]))('%s renders inside Screen, Sheet or SignInFrame', (_rel, src) => {
    expect(WRAPPERS.some((w) => new RegExp(`<${w}\\b`).test(src))).toBe(true);
  });

  test('routes never use SafeAreaView directly (one wrapper, one behavior)', () => {
    const direct = routes.filter((r) => /<SafeAreaView\b/.test(r.src)).map((r) => r.rel);
    expect(direct).toEqual([]);
  });
});
