// G4b (CONTRACT v0.16) fixtures for the Screen 15 views, shaped exactly like the contract's cards and view models.
// Synthetic only: sample labels (Admin, Partner, Twin 1, Twin 2) and clearly fake store products (example.com).
import type { PriceWatch, ProductsResult, RoutineSkip, UpcomingHoliday, WeatherView } from '@shared/domain/api';
import type { Product, ProductRef } from '@shared/domain/integrationShapes';
import type { Card } from '@shared/domain/messages';

const id = <T,>(s: string) => s as unknown as T;
export const IDS = { admin: 'm_admin', partner: 'm_partner', twin1: 'm_twin1', twin2: 'm_twin2' } as const;
/** Tue Nov 10 2026, 6:00 PM New York: the evening before Veterans Day (the demo's holiday question). */
export const EVE = Date.UTC(2026, 10, 10, 23, 0);
/** Thu Oct 29 2026, 2:00 PM New York. */
export const T0 = Date.UTC(2026, 9, 29, 18, 0);
const H = 60 * 60 * 1000;

const REF_KIT: ProductRef = { productId: 'gid://shopify/p/fake-dino-kit', variantId: 'gid://shopify/ProductVariant/fake-dino-kit' };
const REF_POSTER: ProductRef = { productId: 'gid://shopify/p/fake-glow-poster' };
const REF_BALL: ProductRef = { productId: 'gid://shopify/p/fake-ball', variantId: 'gid://shopify/ProductVariant/fake-ball' };

export const PRODUCT_KIT: Product = {
  ...REF_KIT,
  title: 'Dinosaur skeleton building kit',
  priceCents: 2800,
  listPriceCents: 3500,
  currency: 'USD',
  store: 'Example Toy Shop',
  url: 'https://example.com/products/dino-kit',
  available: true,
};
export const PRODUCT_POSTER: Product = { ...REF_POSTER, title: 'Glow-in-the-dark dinosaur poster', priceCents: 1499, currency: 'USD', store: 'Example Print Co', url: 'https://example.com/products/poster', available: true };
export const PRODUCT_SOLD_OUT: Product = { ...REF_BALL, title: 'Personalized soccer ball', priceCents: 2500, currency: 'USD', store: 'Example Sports', url: 'https://example.com/products/ball', available: false };

/** `shopping.products` results. */
export const PRODUCTS_OK: ProductsResult = { products: [PRODUCT_KIT, PRODUCT_POSTER, PRODUCT_SOLD_OUT] };
export const PRODUCTS_EMPTY: ProductsResult = { products: [] };
export const PRODUCTS_DOWN: ProductsResult = { products: [], failure: 'error' };
export const PRODUCTS_NOT_SET_UP: ProductsResult = { products: [], failure: 'not_configured' };

/** The `shop_search` result card in an adult's thread. */
export const PRODUCTS_CARD: Extract<Card, { kind: 'products' }> = { kind: 'products', query: 'dinosaur building kit under $40', refs: [REF_KIT, REF_POSTER, REF_BALL] };
export const PRODUCTS_CARD_FAILED: Extract<Card, { kind: 'products' }> = { kind: 'products', query: 'dinosaur building kit', refs: [], failure: 'error' };

/** Gift idea product refs (pair with gdFixtures GIFTS_READY). */
export const GIFT_IDEA_REFS: ProductRef[][] = [[REF_KIT], [REF_POSTER], []];

export const PRICE_WATCH: PriceWatch = {
  _id: id('pw_1'),
  _creationTime: 0,
  familyId: id('f'),
  giftIdeasId: id('gi_1'),
  ideaIndex: 0,
  forMemberId: id(IDS.twin1),
  ref: REF_KIT,
  title: 'Dinosaur skeleton building kit',
  store: 'Example Toy Shop',
  url: 'https://example.com/products/dino-kit',
  currency: 'USD',
  baselinePriceCents: 3500,
  lastPriceCents: 2800,
  lastCheckedAt: T0,
  alertedPriceCents: 2800,
  status: 'watching',
  createdBy: id(IDS.admin),
  createdAt: T0 - 48 * H,
};
export const PRICE_WATCH_STOPPED: PriceWatch = { ...PRICE_WATCH, status: 'stopped', stoppedBy: id(IDS.partner), stoppedAt: T0 + H };
export const PRICE_DROP_CARD: Extract<Card, { kind: 'priceDrop' }> = { kind: 'priceDrop', watchId: PRICE_WATCH._id };

export const HOLIDAY_ASKED: RoutineSkip = {
  _id: id('rs_1'),
  _creationTime: 0,
  familyId: id('f'),
  date: '2026-11-11',
  holidayName: 'Veterans Day',
  memberIds: [id(IDS.twin1), id(IDS.twin2)],
  status: 'asked',
  askedAt: EVE,
};
export const HOLIDAY_PAUSED: RoutineSkip = { ...HOLIDAY_ASKED, status: 'paused', answeredBy: id(IDS.admin), answeredAt: EVE + 10 * 60_000 };
export const HOLIDAY_KEPT: RoutineSkip = { ...HOLIDAY_ASKED, status: 'kept', answeredBy: id(IDS.partner), answeredAt: EVE + 10 * 60_000 };
export const HOLIDAY_CARD: Extract<Card, { kind: 'holiday' }> = { kind: 'holiday', skipId: HOLIDAY_ASKED._id };

export const UPCOMING_HOLIDAYS: UpcomingHoliday[] = [
  { date: '2026-11-11', name: 'Veterans Day', localName: 'Veterans Day', global: true, types: ['Public', 'Bank'], skip: { skipId: HOLIDAY_ASKED._id, status: 'paused' } },
  { date: '2026-11-26', name: 'Thanksgiving Day', localName: 'Thanksgiving Day', global: true, types: ['Public', 'Bank'], skip: null },
];

/** `weather.get` with air (v0.16). */
export const WEATHER_WITH_AIR: WeatherView = {
  placeId: id('pl_home'),
  placeLabel: 'Home',
  fetchedAt: T0,
  stale: false,
  now: { tempF: 64, code: 1, summary: 'Mostly clear' },
  hours: [0, 1, 2, 3].map((i) => ({ at: T0 + i * H, tempF: 64 - i, precipPct: 5, code: 1 })),
  today: { highF: 66, lowF: 51, precipPct: 10, code: 1 },
  alerts: [],
  air: { usAqi: 42, uvIndex: 3.4, uvIndexMax: 6.8 },
};
export const WEATHER_AIR_POOR: WeatherView = { ...WEATHER_WITH_AIR, air: { usAqi: 128, uvIndex: 2, uvIndexMax: 4 } };

/** Event tip cards (the weather card with `tip`). */
export const UV_TIP_CARD: Extract<Card, { kind: 'weather' }> = {
  kind: 'weather',
  summary: 'UV is high during Soccer practice. Pack sunscreen.',
  at: T0 + 2 * H,
  placeLabel: 'Soccer field',
  eventId: id('ev_soccer'),
  air: { uvAt: 7.1, uvIndexMax: 7.4 },
  tip: 'uv',
};
export const AIR_TIP_CARD: Extract<Card, { kind: 'weather' }> = {
  kind: 'weather',
  summary: 'Air quality is poor during Soccer practice. Maybe keep it short or indoors.',
  at: T0 + 2 * H,
  placeLabel: 'Soccer field',
  eventId: id('ev_soccer'),
  air: { usAqi: 128 },
  tip: 'air',
};
