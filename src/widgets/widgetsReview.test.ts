// G8 review fixes for the widget layouts (security review findings 1–2, UX review findings 3, 5, 6).
import { G8_COPY } from '@shared/config/copy';
import { THEMES } from '@shared/config/theme';
import { WIDGET_ADMIN_AFTERNOON, WIDGET_ADMIN_EVENING, WIDGET_EMPTY, WIDGET_KID } from '@/test/g8Fixtures';
import { allNodes, modifiersOf, privacySensitiveTexts, renderWidget, textOf, textsIn, type WidgetNode } from '@/test/widgetRuntime';
import { nextEntries, widgetColors } from '@/services/widgetSync';
import { MegaNextLayout } from './MegaNext';

jest.mock('expo-widgets', () => ({ createWidget: () => ({ updateTimeline: jest.fn(), updateSnapshot: jest.fn(), reload: jest.fn() }) }));

const colors = widgetColors(THEMES.midnight);
const thu = (h: number, m = 0) => new Date(2026, 9, 29, h, m);
const env = (widgetFamily: string, date: Date) => ({ widgetFamily, date, widgetRenderingMode: widgetFamily.startsWith('accessory') ? 'vibrant' : 'fullColor', configuration: undefined });
const props = (timeline: typeof WIDGET_ADMIN_AFTERNOON, i = 0) => nextEntries(timeline, colors)[i].props;
const sizeOf = (tree: WidgetNode, text: string) => {
  const node = allNodes(tree).find((n) => n.type === 'Text' && textOf(n) === text)!;
  return (modifiersOf(node).find((m) => m.modifier === 'font')!.args[0] as { size: number }).size;
};

describe('privacySensitiveTexts counts only real redaction (security finding 1)', () => {
  test('a Text with privacySensitive(false) — the lock-screen time kicker — is NOT counted as redacted', () => {
    const tree = renderWidget(MegaNextLayout, props(WIDGET_ADMIN_AFTERNOON), env('accessoryRectangular', thu(15, 40)));
    expect(textsIn(tree)).toContain('4:00 PM · in 20 min');
    expect(privacySensitiveTexts(tree)).not.toContain('4:00 PM · in 20 min');
    expect(privacySensitiveTexts(tree)).toContain(G8_COPY.widgetPrivate);
  });
});

describe('a MEGA statement is redacted while the phone is locked (security finding 2)', () => {
  const statement = WIDGET_ADMIN_EVENING.entries[0].statement!;
  test('lock screen: the short line is privacySensitive', () => {
    const tree = renderWidget(MegaNextLayout, props(WIDGET_ADMIN_EVENING), env('accessoryRectangular', thu(20, 15)));
    expect(privacySensitiveTexts(tree)).toContain(statement.short);
  });
  test('home screen medium and small: the statement text is privacySensitive', () => {
    expect(privacySensitiveTexts(renderWidget(MegaNextLayout, props(WIDGET_ADMIN_EVENING), env('systemMedium', thu(20, 15))))).toContain(statement.text);
    expect(privacySensitiveTexts(renderWidget(MegaNextLayout, props(WIDGET_ADMIN_EVENING), env('systemSmall', thu(20, 15))))).toContain(statement.short);
  });
});

describe('empty widget header is the MEGA name (UX finding 3, board WidgetsEmpty)', () => {
  test('medium empty: "Teal" as the header, never "Coming up · next 2 hours" above "All clear"', () => {
    const tree = renderWidget(MegaNextLayout, props(WIDGET_EMPTY), env('systemMedium', thu(9)));
    const texts = textsIn(tree);
    expect(texts).toContain(WIDGET_EMPTY.mega.name);
    expect(texts).not.toContain(G8_COPY.widgetSoonTitle);
  });
});

describe('kid sizes follow the board only (UX finding 5, board WidgetsKidSafe)', () => {
  test('small: the kid title is 19pt vs 17pt for adults', () => {
    const kid = renderWidget(MegaNextLayout, props(WIDGET_KID), env('systemSmall', thu(15, 40)));
    const adult = renderWidget(MegaNextLayout, props({ ...WIDGET_KID, kid: false }), env('systemSmall', thu(15, 40)));
    const title = WIDGET_KID.entries[0].soon![0].title;
    expect(sizeOf(kid, title)).toBe(19);
    expect(sizeOf(adult, title)).toBe(17);
  });
  test('medium and lock: kid text is the same size as an adult’s (no flat 1.25× in a fixed-height widget)', () => {
    for (const family of ['systemMedium', 'accessoryRectangular']) {
      const kid = renderWidget(MegaNextLayout, props(WIDGET_KID), env(family, thu(15, 40)));
      const adult = renderWidget(MegaNextLayout, props({ ...WIDGET_KID, kid: false }), env(family, thu(15, 40)));
      const sizes = (t: WidgetNode) => allNodes(t).flatMap((n) => modifiersOf(n)).filter((m) => m.modifier === 'font').map((m) => (m.args[0] as { size: number }).size);
      expect(sizes(kid)).toEqual(sizes(adult));
    }
  });
});

describe('small-widget tag drops "in " (UX finding 6, board Widgets smallTag)', () => {
  test('small: "20 min"; medium and lock keep "in 20 min"', () => {
    const small = textsIn(renderWidget(MegaNextLayout, props(WIDGET_ADMIN_AFTERNOON), env('systemSmall', thu(15, 40))));
    expect(small).toContain('20 min');
    expect(small).not.toContain('in 20 min');
    expect(textsIn(renderWidget(MegaNextLayout, props(WIDGET_ADMIN_AFTERNOON), env('systemMedium', thu(15, 40))))).toContain('4:00 PM · in 20 min');
  });
});
