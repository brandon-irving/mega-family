// G5 contract stubs (CONTRACT v0.17). Every G5 function is registered with its contract validators from day one so
// the frontend can build against it; until the G5 backend fills one in, it checks the caller and then either
// returns an empty, correctly shaped value or throws this. Remove each call site when its function is real (and
// flip its `day1` to 'real' in shared/domain/api.ts). docs/gates/G5.md requires none left at gate end.
import { fail } from './errors';

export function notBuiltYet(fn: string): never {
  fail('NOT_FOUND', `${fn} isn't built yet (G5 stub)`);
}
