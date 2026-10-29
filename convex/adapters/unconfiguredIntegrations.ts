// G4b contract placeholders for the REAL adapters (`MEGA_MODEL_ADAPTER=real`) until the G4b backend writes them
// (shopifyCatalog.ts, nagerHolidays.ts). They fail closed — `not_configured`, never a fake value — so a live
// deployment can't show made-up products or holidays. The G4b backend replaces each in registry.ts and deletes
// this file; docs/gates/G4b.md requires it gone at gate end.
import type { Holidays } from '../ports/holidays';
import type { ProductCatalog } from '../ports/productCatalog';

const notConfigured = { ok: false as const, failure: 'not_configured' as const, detail: 'G4b adapter not built yet' };

export const unconfiguredProductCatalog: ProductCatalog = { search: async () => notConfigured, lookup: async () => notConfigured };
export const unconfiguredHolidays: Holidays = { list: async () => notConfigured };
