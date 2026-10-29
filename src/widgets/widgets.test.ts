// G8 (CONTRACT v0.18 §6, G8.md invariants 2 and 4; boards Widgets*, WidgetsThree, WidgetsLockPrivate,
// WidgetsKidSafe, WidgetsEmpty, WidgetsStale, WidgetsSignedOut, WidgetsLockSignedOut): the MegaNext and MegaTalk
// layouts, run the way the widget runtime runs them (src/test/widgetRuntime.ts) on the props the app builds
// from a `widgets.next` timeline (src/services/widgetSync.ts).
import { fillCopy, G8_COPY, G8_UI_COPY } from '@shared/config/copy';
import { THEMES } from '@shared/config/theme';
import { WIDGET_ADMIN_AFTERNOON, WIDGET_ADMIN_EVENING, WIDGET_EMPTY, WIDGET_KID } from '@/test/g8Fixtures';
import { allNodes, modifiersOf, privacySensitiveTexts, renderWidget, textsIn, widgetUrlOf, type WidgetNode } from '@/test/widgetRuntime';
import { nextEntries, signedOutNext, signedOutTalk, talkProps, widgetColors } from '@/services/widgetSync';
import { MegaNextLayout } from './MegaNext';
import { MegaTalkLayout } from './MegaTalk';

jest.mock('expo-widgets', () => ({ createWidget: () => ({ updateTimeline: jest.fn(), updateSnapshot: jest.fn(), reload: jest.fn() }) }));

const colors = widgetColors(THEMES.midnight);
const thu = (h: number, m = 0) => new Date(2026, 9, 29, h, m);
const env = (widgetFamily: string, date: Date, extra: Record<string, unknown> = {}) => ({ widgetFamily, date, widgetRenderingMode: widgetFamily.startsWith('accessory') ? 'vibrant' : 'fullColor', configuration: undefined, ...extra });
const entryProps = (timeline: typeof WIDGET_ADMIN_AFTERNOON, i = 0) => nextEntries(timeline, colors)[i].props;
const fontSizes = (root: WidgetNode) =>
  allNodes(root)
    .flatMap((n) => modifiersOf(n))
    .filter((m) => m.modifier === 'font')
    .map((m) => (m.args[0] as { size?: number }).size ?? 0);

describe('nextEntries', () => {
  test('one widget entry per timeline entry, dated at its `at`, sorted, at most WIDGET_TIMELINE.maxEntries', () => {
    const entries = nextEntries(WIDGET_ADMIN_AFTERNOON, colors);
    expect(entries.map((e) => e.date.getTime())).toEqual(WIDGET_ADMIN_AFTERNOON.entries.map((e) => e.at));
    expect(entries[0].props.state).toBe('soon');
    expect(entries.at(-1)?.props.state).toBe('stale');
  });
});

describe('MegaNext · medium (board WidgetsThree)', () => {
  test('"Coming up · next 2 hours" and up to three rows with time and relative time', () => {
    const tree = renderWidget(MegaNextLayout, entryProps(WIDGET_ADMIN_AFTERNOON), env('systemMedium', thu(15, 40)));
    const texts = textsIn(tree);
    expect(texts).toContain(G8_COPY.widgetSoonTitle);
    expect(texts).toEqual(expect.arrayContaining(['Dentist', 'Soccer practice', 'Soccer pickup']));
    expect(texts).toContain('4:00 PM · in 20 min');
    expect(texts).toContain('4:30 PM · in 50 min');
    expect(texts).toContain('5:30 PM · in 1h');
  });

  test('relative times come from the entry date WidgetKit renders (not from the app)', () => {
    const tree = renderWidget(MegaNextLayout, entryProps(WIDGET_ADMIN_AFTERNOON), env('systemMedium', thu(16, 5)));
    expect(textsIn(tree)).toContain('4:00 PM · now');
  });

  test('home screen: the private title shows, still marked privacySensitive (iOS redacts it when locked)', () => {
    const tree = renderWidget(MegaNextLayout, entryProps(WIDGET_ADMIN_AFTERNOON), env('systemMedium', thu(15, 40)));
    expect(privacySensitiveTexts(tree)).toContain('Dentist');
  });

  test('a tap opens the entry’s link', () => {
    const tree = renderWidget(MegaNextLayout, entryProps(WIDGET_ADMIN_AFTERNOON), env('systemMedium', thu(15, 40)));
    expect(widgetUrlOf(tree)).toBe(WIDGET_ADMIN_AFTERNOON.entries[0].link);
  });

  test('a statement entry: "{mega} says", the statement and "Tap to reply" (board WidgetsEvening)', () => {
    const tree = renderWidget(MegaNextLayout, entryProps(WIDGET_ADMIN_EVENING), env('systemMedium', thu(20, 15)));
    const texts = textsIn(tree);
    expect(texts).toContain(fillCopy(G8_COPY.widgetSaysTitle, { mega: 'Teal' }));
    expect(texts).toContain(WIDGET_ADMIN_EVENING.entries[0].statement!.text);
    expect(texts).toContain(G8_COPY.widgetTapToReply);
  });
});

describe('MegaNext · small', () => {
  test('the time tag and the first title', () => {
    const tree = renderWidget(MegaNextLayout, entryProps(WIDGET_ADMIN_AFTERNOON), env('systemSmall', thu(15, 40)));
    const texts = textsIn(tree);
    expect(texts).toContain('in 20 min');
    expect(texts).toContain('Dentist');
    expect(texts).not.toContain('Soccer pickup');
  });

  test('a statement: the Tip tag and the short line', () => {
    const tree = renderWidget(MegaNextLayout, entryProps(WIDGET_ADMIN_EVENING), env('systemSmall', thu(20, 15)));
    const texts = textsIn(tree);
    expect(texts).toContain(G8_COPY.widgetTip);
    expect(texts).toContain(WIDGET_ADMIN_EVENING.entries[0].statement!.short);
  });
});

describe('MegaNext · lock screen (invariant 2, board WidgetsLockPrivate)', () => {
  test('a private event shows "Private event" with the real time kicker; its title is never drawn', () => {
    const tree = renderWidget(MegaNextLayout, entryProps(WIDGET_ADMIN_AFTERNOON), env('accessoryRectangular', thu(15, 40)));
    const texts = textsIn(tree);
    expect(texts).toContain(G8_COPY.widgetPrivate);
    expect(texts).toContain('4:00 PM · in 20 min');
    expect(texts.join(' ')).not.toContain('Dentist');
    expect(privacySensitiveTexts(tree)).toContain(G8_COPY.widgetPrivate);
  });

  test('vibrant rendering on any family counts as the lock screen', () => {
    const tree = renderWidget(MegaNextLayout, entryProps(WIDGET_ADMIN_AFTERNOON), env('systemSmall', thu(15, 40), { widgetRenderingMode: 'vibrant' }));
    expect(textsIn(tree).join(' ')).not.toContain('Dentist');
  });

  test('a household event keeps its title on the lock screen', () => {
    const tree = renderWidget(MegaNextLayout, entryProps(WIDGET_ADMIN_AFTERNOON, 1), env('accessoryRectangular', thu(16, 10)));
    expect(textsIn(tree)).toContain('Soccer practice');
  });

  test('a statement on the lock screen: "{mega} says" and the short line', () => {
    const tree = renderWidget(MegaNextLayout, entryProps(WIDGET_ADMIN_EVENING), env('accessoryRectangular', thu(20, 15)));
    const texts = textsIn(tree);
    expect(texts).toContain(fillCopy(G8_COPY.widgetSaysTitle, { mega: 'Teal' }));
    expect(texts).toContain(WIDGET_ADMIN_EVENING.entries[0].statement!.short);
  });
});

describe('MegaNext · honest empty, stale and signed out (boards WidgetsEmpty, WidgetsStale, WidgetsSignedOut)', () => {
  test('empty: a calm line and the "next 2 hours" footer, no Tip tag, never blank', () => {
    const tree = renderWidget(MegaNextLayout, entryProps(WIDGET_EMPTY), env('systemMedium', thu(9)));
    const texts = textsIn(tree);
    expect(texts).toContain(G8_COPY.widgetEmpty);
    expect(texts).toContain(G8_COPY.widgetNoSoon);
    expect(texts).not.toContain(G8_COPY.widgetTip);
  });

  test('stale: "Open Teal for what’s next" and how long ago it was checked', () => {
    const stale = nextEntries(WIDGET_ADMIN_AFTERNOON, colors).at(-1)!.props;
    const tree = renderWidget(MegaNextLayout, stale, env('systemMedium', new Date(WIDGET_ADMIN_AFTERNOON.generatedAt + 8 * 3600_000)));
    const texts = textsIn(tree);
    expect(texts).toContain(fillCopy(G8_COPY.widgetStale, { mega: 'Teal' }));
    expect(texts).toContain(fillCopy(G8_UI_COPY.widgetLastChecked, { n: 8 }));
    expect(texts).not.toContain(G8_COPY.widgetTip);
  });

  test('signed out: nothing personal, the sign-in line and footer, on every family', () => {
    for (const family of ['systemSmall', 'systemMedium', 'accessoryRectangular']) {
      const tree = renderWidget(MegaNextLayout, signedOutNext(colors, 0), env(family, thu(9)));
      const texts = textsIn(tree);
      expect(texts).toContain(G8_COPY.widgetSignedOut);
      expect(texts.join(' ')).not.toMatch(/Teal|Dentist|Soccer/);
      if (family === 'systemMedium') expect(texts).toContain(G8_UI_COPY.widgetSignedOutFoot);
    }
  });
});

describe('MegaNext · kid sizes (board WidgetsKidSafe)', () => {
  test('a kid’s widget draws bigger type than an adult’s', () => {
    const kid = renderWidget(MegaNextLayout, entryProps(WIDGET_KID), env('systemSmall', thu(15, 40)));
    const adult = renderWidget(MegaNextLayout, entryProps(WIDGET_ADMIN_AFTERNOON), env('systemSmall', thu(15, 40)));
    expect(Math.max(...fontSizes(kid))).toBeGreaterThan(Math.max(...fontSizes(adult)));
    expect(textsIn(kid)).toContain('Soccer practice');
  });
});

describe('MegaTalk (accessoryCircular)', () => {
  test('the MEGA head and "Talk", tapping opens talk', () => {
    const tree = renderWidget(MegaTalkLayout, talkProps(WIDGET_ADMIN_AFTERNOON, colors), env('accessoryCircular', thu(9)));
    expect(textsIn(tree)).toContain(G8_COPY.widgetTalk);
    expect(widgetUrlOf(tree)).toBe(WIDGET_ADMIN_AFTERNOON.talkLink);
    expect(allNodes(tree).some((n) => n.type === 'Rectangle')).toBe(true);
  });

  test('signed out: no MEGA name, opens the app to sign in (board WidgetsLockSignedOut)', () => {
    const tree = renderWidget(MegaTalkLayout, signedOutTalk(colors), env('accessoryCircular', thu(9)));
    expect(textsIn(tree).join(' ')).not.toContain('Teal');
    expect(widgetUrlOf(tree)).not.toBe(WIDGET_ADMIN_AFTERNOON.talkLink);
  });
});
