/// <reference types="vite/client" />
// Milestone A: every function in shared/domain/api.ts exists at convex/<module>.ts, is the right kind of
// Convex function, and its registered args/returns are *exactly* the contract's validators (not a
// hand-retyped lookalike). The generated `api`/`internal` objects (convex/_generated/api.ts) are just
// `anyApi` path proxies outside a real deployment — they carry no kind/validator info to check against —
// so this imports the real convex/*.ts modules directly and inspects the function objects Convex's
// `query`/`mutation`/`action` builders produce (`.isQuery`/`.isMutation`/`.isAction`,
// `.exportArgs()`/`.exportReturns()`), which is what the generated api ultimately points to.
import { asObjectValidator } from 'convex/values';
import { describe, expect, test } from 'vitest';
import { API } from '../shared/domain/api';

const modules = import.meta.glob('./*.ts') as Record<string, () => Promise<Record<string, unknown>>>;

type RegisteredFn = {
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  exportArgs?: () => string;
  exportReturns?: () => string;
};

const KIND_FLAG = { query: 'isQuery', mutation: 'isMutation', action: 'isAction' } as const;

describe('Milestone A: API map <-> convex/*.ts', () => {
  for (const [mod, fns] of Object.entries(API)) {
    const path = `./${mod}.ts`;

    for (const [name, entry] of Object.entries(fns as Record<string, { kind: 'query' | 'mutation' | 'action'; args: Record<string, unknown>; returns: unknown }>)) {
      test(`${mod}.${name}`, async () => {
        expect(modules[path], `expected convex/${mod}.ts to exist`).toBeDefined();
        const loaded = await modules[path]();
        const fn = loaded[name] as RegisteredFn | undefined;
        expect(fn, `convex/${mod}.ts does not export '${name}'`).toBeDefined();

        expect(fn![KIND_FLAG[entry.kind]], `${mod}.${name} should be a ${entry.kind}`).toBe(true);
        expect(typeof fn!.exportArgs, `${mod}.${name} isn't a registered Convex function`).toBe('function');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- introspecting arbitrary contract validators at runtime, not meant to be precisely typed
        const expectedArgs = JSON.stringify((asObjectValidator(entry.args as any) as any).json);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const expectedReturns = JSON.stringify((asObjectValidator(entry.returns as any) as any).json);
        expect(fn!.exportArgs!(), `${mod}.${name}'s args validator drifted from shared/domain/api.ts`).toBe(expectedArgs);
        expect(fn!.exportReturns!(), `${mod}.${name}'s returns validator drifted from shared/domain/api.ts`).toBe(expectedReturns);
      });
    }
  }

  test('every API entry was actually checked (sanity: catches a typo in the loop above)', () => {
    const total = Object.values(API).reduce((n, fns) => n + Object.keys(fns).length, 0);
    expect(total).toBeGreaterThan(40);
  });
});
