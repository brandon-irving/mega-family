// Screen 15 boards (G4b, CONTRACT v0.16): ShopResults / ShopEmpty / ShopNotSetUp (products card), GiftsProducts /
// GiftsNoCatalog (gift ideas with products), PriceDrop, WeatherAir / WeatherAirTips (air tiles and tips),
// HolidayAsk / HolidayPaused (holiday question), HolidayCalendar (calendar marker) and the place sheet's Outdoor
// switch. Pure views fed by the contract-shaped fixtures (src/test/g4bFixtures.ts).
import { fireEvent, screen } from '@testing-library/react-native';
import { useState, type ReactElement } from 'react';
import { formatPriceCents } from '@shared/config/shopping';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { THEMES } from '@shared/config/theme';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CAL_MEMBERS, GIFTS_READY, IDS, THURSDAY_EVENTS } from '@/test/gdFixtures';
import { PLACES_FIXTURE } from '@/test/g4Fixtures';
import {
  AIR_TIP_CARD,
  GIFT_IDEA_REFS,
  HOLIDAY_ASKED,
  HOLIDAY_KEPT,
  HOLIDAY_PAUSED,
  PRICE_WATCH,
  PRICE_WATCH_STOPPED,
  PRODUCT_KIT,
  PRODUCT_POSTER,
  PRODUCT_SOLD_OUT,
  PRODUCTS_CARD,
  PRODUCTS_CARD_FAILED,
  T0,
  UPCOMING_HOLIDAYS,
  UV_TIP_CARD,
} from '@/test/g4bFixtures';
import type { GiftIdeas } from '@/features/calendar/GiftsCard';
import { GiftsCardView, giftRefs } from '@/features/calendar/GiftsCard';
import { CalendarContent } from '@/features/family/CalendarContent';
import { HolidayCardView, joinNames, weekdayOf } from '@/features/holidays/HolidayCard';
import { aqiLevel, uvLevel } from '@/features/integrations/airLevels';
import { WeatherCardView } from '@/features/integrations/IntegrationCards';
import { PlaceSheet } from '@/features/integrations/PlacesContent';
import { daysUntil } from './format';
import { PriceDropCardView } from './PriceDropCard';
import { ProductsCardView } from './ProductsCard';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const noop = () => {};
const midnight = THEMES.midnight;
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const NAMES: Record<string, string> = { [IDS.admin]: 'Admin', [IDS.partner]: 'Partner', [IDS.twin1]: 'Twin 1', [IDS.twin2]: 'Twin 2' };
const nameOf = (id: string) => NAMES[id] ?? '';
const ok = (products = [PRODUCT_KIT, PRODUCT_POSTER, PRODUCT_SOLD_OUT]) => ({ status: 'ok' as const, products });

describe('format', () => {
  test('prices: the one shared formatter (same text as the push): whole dollars short, cents when there are some, non-USD with its code', () => {
    expect(formatPriceCents(2800, 'USD')).toBe('$28');
    expect(formatPriceCents(3499, 'USD')).toBe('$34.99');
    expect(formatPriceCents(1000, 'CAD')).toBe('10 CAD');
  });
  test('days until a date, from the family’s local today, never negative', () => {
    expect(daysUntil('2026-11-08', '2026-10-30')).toBe(9);
    expect(daysUntil('2026-11-08', '2026-11-09')).toBe(0);
  });
  test('levels follow config bands (lower bound inclusive) and the board’s tones', () => {
    expect(uvLevel(8)).toEqual({ value: 8, word: 'Very high', tone: 'danger' });
    expect(uvLevel(2.4)).toMatchObject({ word: 'Low', tone: 'ok' });
    expect(aqiLevel(132)).toMatchObject({ word: 'Unhealthy for sensitive groups', tone: 'warn' });
    expect(aqiLevel(42)).toMatchObject({ word: 'Good', tone: 'ok' });
    expect(aqiLevel(151)).toMatchObject({ word: 'Unhealthy', tone: 'danger' });
  });
});

describe('Products card (boards ShopResults / ShopEmpty / ShopNotSetUp)', () => {
  test('results: the query, one row per product with price, store and an Open link labelled with both', async () => {
    const onOpen = jest.fn();
    await renderWithTheme(<ProductsCardView card={PRODUCTS_CARD} megaName="Teal" state={ok()} onOpen={onOpen} />);
    expect(screen.getByText('Teal · Shopping')).toBeTruthy();
    expect(screen.getByText('For “dinosaur building kit under $40”')).toBeTruthy();
    expect(screen.getAllByTestId('product-row')).toHaveLength(3);
    expect(screen.getByText('$28')).toBeTruthy();
    expect(screen.getByText('Example Toy Shop')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open Dinosaur skeleton building kit at Example Toy Shop'));
    expect(onOpen).toHaveBeenCalledWith('https://example.com/products/dino-kit');
    expect(screen.getByText('Prices from Shopify stores, checked just now. MEGA never buys anything.')).toBeTruthy();
  });

  test('a sale shows the struck-through "was" price; a sold-out product says so instead of its store', async () => {
    await renderWithTheme(<ProductsCardView card={PRODUCTS_CARD} megaName="Teal" state={ok()} onOpen={noop} />);
    const was = screen.getByText('was $35');
    expect(was.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ textDecorationLine: 'line-through' })]));
    expect(screen.getByText('Out of stock')).toBeTruthy();
    expect(screen.getByLabelText('Personalized soccer ball, out of stock')).toBeTruthy();
  });

  test('no picture from the store: the pixel gift box, labelled for screen readers', async () => {
    await renderWithTheme(<ProductsCardView card={PRODUCTS_CARD} megaName="Teal" state={ok([PRODUCT_POSTER])} onOpen={noop} />);
    expect(screen.getByLabelText('No picture from the store')).toBeTruthy();
  });

  test('loading: "Checking prices…" with one placeholder row per ref, and no prices yet', async () => {
    await renderWithTheme(<ProductsCardView card={PRODUCTS_CARD} megaName="Teal" state={{ status: 'loading' }} onOpen={noop} />);
    expect(screen.getByText('Checking prices…')).toBeTruthy();
    expect(screen.getAllByTestId('product-row-skeleton', { includeHiddenElements: true })).toHaveLength(3);
    expect(screen.queryByText('$28')).toBeNull();
  });

  test('empty: says it found nothing (no rows, never a made-up product)', async () => {
    await renderWithTheme(<ProductsCardView card={{ ...PRODUCTS_CARD, refs: [] }} megaName="Teal" state={ok([])} onOpen={noop} />);
    expect(screen.getByText('I couldn’t find anything for that. Try different words?')).toBeTruthy();
    expect(screen.queryAllByTestId('product-row')).toHaveLength(0);
  });

  test('not set up: says store search isn’t set up and won’t guess (no rows)', async () => {
    await renderWithTheme(<ProductsCardView card={PRODUCTS_CARD} megaName="Teal" state={{ status: 'failure', failure: 'not_configured' }} onOpen={noop} />);
    expect(screen.getByText('Store search isn’t set up yet.')).toBeTruthy();
    expect(screen.queryAllByTestId('product-row')).toHaveLength(0);
  });

  test('a card the catalog couldn’t answer asks to try later', async () => {
    await renderWithTheme(<ProductsCardView card={PRODUCTS_CARD_FAILED} megaName="Teal" state={ok([])} onOpen={noop} />);
    expect(screen.getByText('I can’t check stores right now. Try again in a bit?')).toBeTruthy();
  });

  test('refused (a stub or a kid): the calm try-later line, no rows', async () => {
    await renderWithTheme(<ProductsCardView card={PRODUCTS_CARD} megaName="Teal" state={{ status: 'failure', failure: 'refused' }} onOpen={noop} />);
    expect(screen.getByText('I can’t check stores right now. Try again in a bit?')).toBeTruthy();
  });
});

const GIFTS_WITH_REFS: GiftIdeas = {
  ...GIFTS_READY,
  ideas: GIFTS_READY.ideas.map((idea, i) => ({ ...idea, productRefs: GIFT_IDEA_REFS[i], url: i === 1 ? 'https://example.org/fossil-kits' : undefined })),
};

describe('Gift ideas with products (boards GiftsProducts / GiftsNoCatalog)', () => {
  test('one lookup covers every idea’s refs, capped per idea', () => {
    expect(giftRefs(GIFTS_WITH_REFS).map((r) => r.productId)).toEqual(['gid://shopify/p/fake-dino-kit', 'gid://shopify/p/fake-glow-poster']);
  });

  test('each idea shows its products under "In stores now", with Open links', async () => {
    const onOpen = jest.fn();
    await renderWithTheme(<GiftsCardView megaName="Teal" forName="Twin 1" gifts={GIFTS_WITH_REFS} onAdd={noop} products={ok([PRODUCT_KIT, PRODUCT_POSTER])} onOpen={onOpen} />);
    expect(screen.getByText('Teal · Gift ideas')).toBeTruthy();
    expect(screen.getAllByText('In stores now')).toHaveLength(2);
    expect(screen.getAllByTestId('product-row')).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText('Open Glow-in-the-dark dinosaur poster at Example Print Co'));
    expect(onOpen).toHaveBeenCalledWith('https://example.com/products/poster');
  });

  test('"Based on what’s shared" chips sit on one sideways-scrolling line (never wrap)', async () => {
    await renderWithTheme(<GiftsCardView megaName="Teal" forName="Twin 1" gifts={GIFTS_WITH_REFS} onAdd={noop} products={ok([PRODUCT_KIT])} />);
    expect(screen.getByTestId('tag-list').props.horizontal).toBe(true);
  });

  test('an idea on a price watch gets the "Watching the price" chip; others don’t', async () => {
    await renderWithTheme(<GiftsCardView megaName="Teal" forName="Twin 1" gifts={GIFTS_WITH_REFS} onAdd={noop} products={ok([PRODUCT_KIT])} watching={[1]} />);
    expect(screen.getAllByText('Watching the price')).toHaveLength(1);
    expect(screen.getByLabelText('Watching the price of Dig-your-own fossil kit')).toBeTruthy();
  });

  test('while prices load, placeholder rows (never a bare "Loading…")', async () => {
    await renderWithTheme(<GiftsCardView megaName="Teal" forName="Twin 1" gifts={GIFTS_WITH_REFS} onAdd={noop} products={{ status: 'loading' }} />);
    expect(screen.getAllByTestId('product-row-skeleton', { includeHiddenElements: true })).toHaveLength(2);
  });

  test('catalog not set up: says so, and an idea with a web link shows it marked "no price checked"', async () => {
    const onOpen = jest.fn();
    await renderWithTheme(<GiftsCardView megaName="Teal" forName="Twin 1" gifts={GIFTS_WITH_REFS} onAdd={noop} products={{ status: 'failure', failure: 'not_configured' }} onOpen={onOpen} />);
    expect(screen.getByText('Store prices aren’t set up yet, so these are web links without prices. I won’t guess what things cost.')).toBeTruthy();
    expect(screen.queryAllByTestId('product-row')).toHaveLength(0);
    expect(screen.getByText('example.org · no price checked')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Dig-your-own fossil kit, example.org'));
    expect(onOpen).toHaveBeenCalledWith('https://example.org/fossil-kits');
  });

  test('Add to list still works on each idea', async () => {
    const onAdd = jest.fn();
    await renderWithTheme(<GiftsCardView megaName="Teal" forName="Twin 1" gifts={GIFTS_WITH_REFS} onAdd={onAdd} products={ok([PRODUCT_KIT])} />);
    await fireEvent.press(screen.getByLabelText('Add to list: Dinosaur skeleton building set'));
    expect(onAdd).toHaveBeenCalledWith(0);
  });
});

describe('Price drop (board PriceDrop)', () => {
  const view = (extra: Partial<Parameters<typeof PriceDropCardView>[0]> = {}) => <PriceDropCardView watch={PRICE_WATCH} megaName="Teal" forName="Twin 1" daysLeft={9} onOpen={noop} onStop={noop} {...extra} />;

  test('the drop, Was (struck through) beside Now, the countdown, and the recipient-never-sees-it note', async () => {
    await renderWithTheme(view());
    expect(screen.getByText('Teal · Price drop')).toBeTruthy();
    expect(screen.getByText('Dinosaur skeleton building kit dropped to $28 (was $35). Twin 1’s birthday is in 9 days.')).toBeTruthy();
    expect(screen.getByLabelText('Was $35')).toBeTruthy();
    expect(screen.getByLabelText('Now $28')).toBeTruthy();
    expect(screen.getByText('Only grown-ups get price alerts. Twin 1 never sees them, so the gift stays a surprise.')).toBeTruthy();
  });

  test('Open in store opens the saved link; Stop watching stops it', async () => {
    const onOpen = jest.fn();
    const onStop = jest.fn();
    await renderWithTheme(view({ onOpen, onStop }));
    await fireEvent.press(screen.getByText('Open in store'));
    expect(onOpen).toHaveBeenCalledWith('https://example.com/products/dino-kit');
    await fireEvent.press(screen.getByText('Stop watching'));
    expect(onStop).toHaveBeenCalled();
  });

  test('the live product row replaces the saved details when the store answers', async () => {
    await renderWithTheme(view({ live: { ...PRODUCT_KIT, title: 'Dinosaur kit (live)' } }));
    expect(screen.getByText('Dinosaur kit (live)')).toBeTruthy();
  });

  test('stopped: no buttons, "Stopped watching…"', async () => {
    await renderWithTheme(view({ watch: PRICE_WATCH_STOPPED }));
    expect(screen.queryByText('Stop watching')).toBeNull();
    expect(screen.queryByText('Open in store')).toBeNull();
    expect(screen.getByText('Stopped watching. I won’t check this price again.')).toBeTruthy();
  });

  test('without the birthday (gift ideas unreadable), the plain drop line', async () => {
    await renderWithTheme(view({ daysLeft: undefined }));
    expect(screen.getByText('Dinosaur skeleton building kit dropped to $28 (was $35).')).toBeTruthy();
  });
});

describe('Air quality and UV (boards WeatherAir / WeatherAirTips)', () => {
  const weatherCard = { kind: 'weather' as const, summary: 'Sunny and hazy', at: T0, placeLabel: 'Soccer field', nowF: 84, air: { uvIndexMax: 8, usAqi: 132 } };

  test('the weather card gains a UV tile and an AQI tile, each with its level word in the level’s color', async () => {
    await renderWithTheme(<WeatherCardView card={weatherCard} tz="America/New_York" />);
    expect(screen.getAllByTestId('air-tile')).toHaveLength(2);
    expect(screen.getByLabelText('UV index 8, Very high')).toBeTruthy();
    expect(screen.getByLabelText('Air quality index 132, Unhealthy for sensitive groups')).toBeTruthy();
    expect(screen.getByText('Very high').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: midnight.danger })]));
    expect(screen.getByText('Unhealthy for sensitive groups').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: midnight.warn })]));
  });

  test('no air data: no tiles (never a guessed reading)', async () => {
    await renderWithTheme(<WeatherCardView card={{ ...weatherCard, air: undefined }} tz="America/New_York" />);
    expect(screen.queryAllByTestId('air-tile')).toHaveLength(0);
  });

  test('UV tip: the tip line, where and when, and the UV number with its level', async () => {
    await renderWithTheme(<WeatherCardView card={UV_TIP_CARD} tz="America/New_York" megaName="Teal" />);
    expect(screen.getByText('Teal · UV')).toBeTruthy();
    expect(screen.getByText('UV is high during Soccer practice. Pack sunscreen.')).toBeTruthy();
    expect(screen.getByText('Soccer field · 4:00 PM')).toBeTruthy();
    expect(screen.getByLabelText('UV index 7, High')).toBeTruthy();
  });

  test('air tip: the AQI number with its level', async () => {
    await renderWithTheme(<WeatherCardView card={AIR_TIP_CARD} tz="America/New_York" megaName="Teal" />);
    expect(screen.getByText('Teal · Air quality')).toBeTruthy();
    expect(screen.getByLabelText('Air quality index 128, Unhealthy for sensitive groups')).toBeTruthy();
  });
});

describe('Holiday question (boards HolidayAsk / HolidayPaused)', () => {
  test('helpers: the weekday of the family’s date, and names joined for a sentence', () => {
    expect(weekdayOf('2026-11-11')).toBe('Wednesday');
    expect(joinNames(['Twin 1', 'Twin 2'])).toBe('Twin 1 and Twin 2');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });

  test('asked: the question names the day, the holiday and the kids, says why it asks, and stacks two full-width buttons', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(<HolidayCardView skip={HOLIDAY_ASKED} megaName="Teal" nameOf={nameOf} onAnswer={onAnswer} />);
    expect(screen.getByText('Teal · Tomorrow')).toBeTruthy();
    expect(screen.getByText('Wednesday is Veterans Day. Pause the morning routine and chores for Twin 1 and Twin 2?')).toBeTruthy();
    expect(screen.getByText('Holidays don’t always mean no school, so I’m asking instead of guessing.')).toBeTruthy();
    expect(screen.getAllByTestId('button-row-line')).toHaveLength(2);
    await fireEvent.press(screen.getByText('Pause for the day'));
    expect(onAnswer).toHaveBeenCalledWith('pause');
    await fireEvent.press(screen.getByText('Keep as usual'));
    expect(onAnswer).toHaveBeenCalledWith('keep');
  });

  test('paused: the buttons give way to who paused it', async () => {
    await renderWithTheme(<HolidayCardView skip={HOLIDAY_PAUSED} megaName="Teal" nameOf={nameOf} onAnswer={noop} />);
    expect(screen.queryByText('Pause for the day')).toBeNull();
    expect(screen.getByText('Paused for Wednesday by Admin. Bedtime prep will say there’s no school routine.')).toBeTruthy();
  });

  test('kept: says who kept it', async () => {
    await renderWithTheme(<HolidayCardView skip={HOLIDAY_KEPT} megaName="Teal" nameOf={nameOf} onAnswer={noop} />);
    expect(screen.getByText('Kept as usual for Wednesday by Partner.')).toBeTruthy();
  });
});

describe('Calendar holiday marker (board HolidayCalendar)', () => {
  const NOV_8 = new Date(2026, 10, 8).getTime();

  test('the holiday’s day gets a diamond and its name; selecting it shows the banner with the family’s decision', async () => {
    await renderWithTheme(<CalendarContent weekStart={NOV_8} todayIndex={3} events={THURSDAY_EVENTS} members={CAL_MEMBERS} viewerId={IDS.admin} holidays={UPCOMING_HOLIDAYS} />);
    expect(screen.getAllByTestId('holiday-diamond', { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.getByLabelText('Wednesday, November 11, Veterans Day')).toBeTruthy();
    expect(screen.getByText('Veterans Day · public holiday')).toBeTruthy();
    expect(screen.getByText('The morning routine and chores are paused for the day.')).toBeTruthy();
    expect(screen.getByText('Public holidays come from a holiday calendar. School closures still come from the school’s own calendar link.')).toBeTruthy();
  });

  test('another day: no banner; a week with no holiday: no marker and no note', async () => {
    await renderWithTheme(<CalendarContent weekStart={NOV_8} todayIndex={1} events={[]} members={CAL_MEMBERS} viewerId={IDS.admin} holidays={[]} />);
    expect(screen.queryAllByTestId('holiday-diamond', { includeHiddenElements: true })).toHaveLength(0);
    expect(screen.queryByTestId('holiday-banner')).toBeNull();
  });
});

describe('Place sheet Outdoor switch', () => {
  const renderScreen = (ui: ReactElement) => renderWithTheme(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);

  test('off by default; turning it on saves `outdoor: true`', async () => {
    const onSave = jest.fn();
    await renderScreen(<PlaceSheet open place={PLACES_FIXTURE[3]} hasHome onSave={onSave} onRemove={noop} onClose={noop} />);
    const sw = screen.getByRole('switch', { name: 'Outdoors' });
    expect(sw.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(sw);
    expect(screen.getByRole('switch', { name: 'Outdoors' }).props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ label: 'Riverside Park Field', outdoor: true }));
  });

  test('an outdoor place opens with the switch on', async () => {
    await renderScreen(<PlaceSheet open place={{ ...PLACES_FIXTURE[3], outdoor: true }} hasHome onSave={noop} onRemove={noop} onClose={noop} />);
    expect(screen.getByRole('switch', { name: 'Outdoors' }).props.accessibilityState).toMatchObject({ checked: true });
  });
});

// G4b review fixes (failing-first regression tests).
describe('G4b review fixes', () => {
  const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

  test('fix 1: a product row never shrinks its price or "was" price; only the store name gives way', async () => {
    await renderWithTheme(<ProductsCardView card={PRODUCTS_CARD} megaName="Teal" state={ok([PRODUCT_KIT])} onOpen={noop} />);
    const price = screen.getByText(formatPriceCents(PRODUCT_KIT.priceCents));
    const was = screen.getByText(`was ${formatPriceCents(PRODUCT_KIT.listPriceCents!)}`);
    expect(flat(price.props.style).flexShrink).toBe(0);
    expect(flat(was.props.style).flexShrink).toBe(0);
    expect(price.props.numberOfLines).toBeUndefined();
    expect(flat(screen.getByText(PRODUCT_KIT.store).props.style).flexShrink).toBe(1);
  });

  test('fix 2: the price-drop card shows prices exactly as the push does (one shared formatter)', async () => {
    await renderWithTheme(<PriceDropCardView watch={PRICE_WATCH} megaName="Teal" forName="Twin 1" daysLeft={9} onOpen={noop} onStop={noop} />);
    expect(screen.getByLabelText(`Now ${formatPriceCents(2800)}`)).toBeTruthy();
    expect(screen.getByLabelText(`Was ${formatPriceCents(3500)}`)).toBeTruthy();
    expect(screen.getByText(`Dinosaur skeleton building kit dropped to ${formatPriceCents(2800)} (was ${formatPriceCents(3500)}). Twin 1’s birthday is in 9 days.`)).toBeTruthy();
  });

  test('fix 3: the calendar pages by week, and the week holding a holiday shows its diamond and banner', async () => {
    const OCT_25 = new Date(2026, 9, 25).getTime();
    const WEEK = 7 * 86_400_000;
    function Harness() {
      const [week, setWeek] = useState(OCT_25);
      return (
        <CalendarContent
          key={week}
          weekStart={week}
          todayIndex={week === OCT_25 ? 4 : null}
          events={[]}
          members={CAL_MEMBERS}
          viewerId={IDS.admin}
          holidays={UPCOMING_HOLIDAYS}
          onPrevWeek={() => setWeek((w) => w - WEEK)}
          onNextWeek={() => setWeek((w) => w + WEEK)}
        />
      );
    }
    await renderWithTheme(<Harness />);
    expect(screen.queryAllByTestId('holiday-diamond', { includeHiddenElements: true })).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('Next week'));
    await fireEvent.press(screen.getByLabelText('Next week'));
    expect(screen.getAllByTestId('holiday-diamond', { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.getByText('Veterans Day · public holiday')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Previous week'));
    expect(screen.queryAllByTestId('holiday-diamond', { includeHiddenElements: true })).toHaveLength(0);
  });

  test('fix 4: with store products the footer promises price alerts and never buying', async () => {
    await renderWithTheme(<GiftsCardView megaName="Teal" forName="Twin 1" gifts={GIFTS_WITH_REFS} onAdd={noop} products={ok([PRODUCT_KIT, PRODUCT_POSTER])} />);
    expect(screen.getByText('Only shared info is used. I’ll tell you if a price drops on something you add. I never buy anything.')).toBeTruthy();
    expect(screen.queryByText('Only shared info is used. Private notes stay private.')).toBeNull();
  });

  test('fix 4: the no-catalog card keeps the privacy footer', async () => {
    await renderWithTheme(<GiftsCardView megaName="Teal" forName="Twin 1" gifts={GIFTS_WITH_REFS} onAdd={noop} products={{ status: 'failure', failure: 'not_configured' }} />);
    expect(screen.getByText('Only shared info is used. Private notes stay private.')).toBeTruthy();
  });

  test('fix 5: the products card uses its own heading when the server gives one', async () => {
    await renderWithTheme(<ProductsCardView card={{ ...PRODUCTS_CARD, title: 'Kids’ rain jackets · under $40' }} megaName="Teal" state={ok()} onOpen={noop} />);
    expect(screen.getByText('Kids’ rain jackets · under $40')).toBeTruthy();
    expect(screen.queryByText('For “dinosaur building kit under $40”')).toBeNull();
  });

  test('fix 6: an idea with store products drops the "· $price" guess (the rows show real prices)', async () => {
    const idea = GIFTS_WITH_REFS.ideas[0];
    await renderWithTheme(<GiftsCardView megaName="Teal" forName="Twin 1" gifts={GIFTS_WITH_REFS} onAdd={noop} products={ok([PRODUCT_KIT, PRODUCT_POSTER])} />);
    expect(screen.getByText(idea.why)).toBeTruthy();
    expect(screen.queryByText(`${idea.why} · ${idea.price}`)).toBeNull();
  });

  test('fix 6: without a catalog the idea keeps its "· $price" estimate', async () => {
    const idea = GIFTS_WITH_REFS.ideas[0];
    await renderWithTheme(<GiftsCardView megaName="Teal" forName="Twin 1" gifts={GIFTS_WITH_REFS} onAdd={noop} products={{ status: 'failure', failure: 'not_configured' }} />);
    expect(screen.getByText(`${idea.why} · ${idea.price}`)).toBeTruthy();
  });
});
