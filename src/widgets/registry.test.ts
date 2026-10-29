// G8 (G8.md invariant 9): the web bundle must never load @expo/ui's SwiftUI views (they require native view
// managers at import and broke `expo export --platform web`). The app reaches the widgets only through
// src/widgets/registry, whose non-iOS file imports types alone.
import { readSourceFile, SRC_ROOT } from '@/test/sourceFiles';
import { join } from 'node:path';
import { MegaNext, MegaTalk } from './registry';

// jest runs as iOS, so './registry' is registry.ios.ts here: the real createWidget objects (mocked).
jest.mock('expo-widgets', () => ({ createWidget: () => ({ updateTimeline: jest.fn(), updateSnapshot: jest.fn() }) }));

const read = (rel: string) => readSourceFile(join(SRC_ROOT, rel));

test('the non-iOS registry imports no widget layout and no @expo/ui', () => {
  const src = read('widgets/registry.ts');
  const imports = src.split('\n').filter((line) => /^\s*(import|export) .* from /.test(line));
  expect(imports.filter((line) => /'\.\/Mega(Next|Talk)'|'@expo\/ui|'expo-widgets'/.test(line))).toEqual([]);
});

test('app code reaches the widgets only through the registry', () => {
  const sync = read('features/widgets/WidgetSync.tsx');
  expect(sync).toMatch(/from '@\/widgets\/registry'/);
  expect(sync).not.toMatch(/from '@\/widgets\/Mega(Next|Talk)'/);
});

test('both registries expose the same writer surface', () => {
  expect(typeof MegaNext.updateTimeline).toBe('function');
  expect(typeof MegaNext.updateSnapshot).toBe('function');
  expect(typeof MegaTalk.updateSnapshot).toBe('function');
});
