// Type-level + runtime check that src/data/api.ts's FunctionReferences match shared/domain/api.ts
// exactly (CONTRACT §4): same modules, same function names, and each ref's path is "module:fn".
import { getFunctionName } from 'convex/server';
import { API } from '@shared/domain/api';
import { api } from '@/data/api';

describe('src/data/api.ts refs match the contract', () => {
  test('every module in API has a matching ref module', () => {
    expect(Object.keys(api).sort()).toEqual(Object.keys(API).sort());
  });

  test.each(Object.keys(API))('module "%s" has every contract function, named "module:fn"', (moduleName) => {
    const fns = Object.keys(API[moduleName as keyof typeof API]);
    const refs = api[moduleName as keyof typeof api] as Record<string, unknown>;
    expect(Object.keys(refs).sort()).toEqual(fns.sort());
    for (const fnName of fns) {
      expect(getFunctionName(refs[fnName] as never)).toBe(`${moduleName}:${fnName}`);
    }
  });
});
