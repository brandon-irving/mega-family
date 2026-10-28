// Shared by the live scripts (scripts/live/*, evals/run.ts): `convexTest` normally takes its `modules` map
// from Vite's `import.meta.glob`, which doesn't exist under plain `tsx`/Node. This is the small manual
// equivalent: every `.ts`/`.js` file under convex/, keyed exactly the same way (`"./relative/path.ts"`) so
// convex-test's function-reference resolution works identically.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONVEX_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../convex');

export function buildModules(): Record<string, () => Promise<unknown>> {
  const out: Record<string, () => Promise<unknown>> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full); // includes `_generated` — convex-test needs its entries present to find the module root
        continue;
      }
      // `.d.ts` files have no runtime JS to import; everything else real (`.ts`, and `_generated`'s `.js`) goes in.
      if (entry.name.endsWith('.d.ts') || !(entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) continue;
      const rel = path.relative(CONVEX_DIR, full).split(path.sep).join('/');
      out[`./${rel}`] = () => import(full);
    }
  };
  walk(CONVEX_DIR);
  return out;
}
