// G4b (CONTRACT v0.16): shopping (Shopify Global Catalog) and public holidays (Nager.Date). Providers sit behind
// ports (convex/ports/productCatalog.ts, holidays.ts); `convex/adapters/registry.ts` picks the adapter. External
// API facts are from the providers' current docs (Oct 28): shopify.dev/docs/agents/catalog (+ global-catalog,
// profiles) and date.nager.at/API (v3).
import type { Role } from '../domain/enums';
import type { RoutineKind } from './kids';

export const SHOPPING = {
  provider: 'shopifyGlobalCatalog' as const,
  /** UCP Catalog over MCP (JSON-RPC 2.0 `tools/call`: `search_catalog`, `lookup_catalog`). Keyless access works
   * with an agent profile and no token (probed Oct 28); a Dev Dashboard client-credentials token
   * (`read_global_api_catalog_search`) is optional and only raises rate limits. */
  endpoint: 'https://catalog.shopify.com/api/ucp/mcp',
  /** Our UCP platform ("agent") profile, served by convex/http.ts at `<CONVEX_SITE_URL><path>`. Every request
   * sends it as `meta["ucp-agent"].profile`; without one Shopify answers 422 `invalid_profile_url`. It declares
   * only the catalog capabilities (search + lookup): no cart, no checkout. */
  agentProfilePath: '/ucp/agent-profile.json',
  ucpVersion: '2026-08-25',
  /** `filters.ships_to.country` on search, `context.address_country` on lookup. Families outside it get no results. */
  country: 'US',
  /** Products per `shop_search` call (`pagination.limit`, Shopify max 50). */
  searchLimit: 5,
  /** At most this many refs per `shopping.products` call (Shopify's lookup takes up to 50). */
  maxLookup: 10,
  timeoutMs: 10_000,
  /** Who may search, see products and price watches. Kids never shop. */
  viewers: ['admin', 'adult'] as readonly Role[],
  /** `shop_search` per adult per day, and per reply. Catalog results are untrusted (like web search): after one,
   * the rest of the turn is read-only. */
  maxSearchesPerMemberPerDay: 20,
  maxSearchesPerReply: 1,
  /** Price watch: how often the cron re-looks-up every active watch, and what counts as a drop worth a quiet
   * update (either threshold). */
  priceCheckHours: 6,
  dropMinPct: 10,
  dropMinCents: 500,
  maxActiveWatchesPerFamily: 20,
  /** Watches stop by themselves this many days after the gift's occasion date. */
  stopAfterOccasionDays: 1,
} as const;

export const HOLIDAYS = {
  provider: 'nagerDate' as const,
  /** GET {baseUrl}/PublicHolidays/{year}/{countryCode} → [{ date, localName, name, countryCode, fixed, global,
   * counties, launchYear, types }]. Free, no key, no published rate limit. */
  baseUrl: 'https://date.nager.at/api/v3',
  defaultCountry: 'US',
  /** Only these Nager types count (Observances like Lincoln's Birthday don't). */
  types: ['Public'] as readonly string[],
  /** Regional holidays (`global: false`, listed per `counties`) need the family's state, which we don't store:
   * skipped. Nager.Date has no school calendars for the US, so a holiday is a question, never a decision. */
  globalOnly: true,
  /** Cache lifetime and the refresh cron (both years in view: this one and next). */
  refreshDays: 7,
  /** `holidays.upcoming` default and max window. */
  upcomingDays: 30,
  maxUpcomingDays: 90,
  /** The question goes to adults the evening before (family local time), only for a weekday holiday on which a
   * kid has a morning routine or a chore. Delivered through the normal pipeline (quiet hours, caps). */
  askAt: '18:00',
  weekdaysOnly: true,
  /** What "Pause for the day" skips for those kids: these routines that day (and the bedtime prep the night
   * before, which then says "No school routine tomorrow"), and that day's chores. */
  pauses: { routines: ['morning'] as readonly RoutineKind[], chores: true },
  timeoutMs: 10_000,
} as const;
