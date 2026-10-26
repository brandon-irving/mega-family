// Shared by the src/-wide lint-style tests (noHardcodedColors, noRawUseQuery): walks every .ts/.tsx file
// under src/ once, so each test pattern-matches on the same file list instead of re-implementing its own
// directory walk (DRY).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const SRC_ROOT = join(__dirname, '..'); // src/

export function collectSourceFiles(dir: string = SRC_ROOT, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectSourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

export function relativeToSrc(file: string): string {
  return relative(SRC_ROOT, file);
}

export function readSourceFile(file: string): string {
  return readFileSync(file, 'utf8');
}
