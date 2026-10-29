// G8 (CONTRACT v0.18) fixtures for the widget timeline (`widgets.next`), shaped exactly like the contract's
// `WidgetTimeline`. Synthetic only, generic sample labels (Admin, Partner, Twin 1, Twin 2; MEGAs Teal, Zap).
// Times are Thursday of the seed week (Oct 29, 2026), local.
import type { WidgetTimeline } from '@shared/domain/api';
import { LINKS } from '@shared/domain/api';

const thu = (h: number, m = 0) => new Date(2026, 9, 29, h, m).getTime();
const TEAL = { name: 'Teal', hex: '#2FB8B0', sticker: 'none', face: 'open' };
const ZAP = { name: 'Zap', hex: '#8E6CE0', sticker: 'bolt', face: 'happy' };
const WHO = { you: { name: 'You', hex: '#2FB8B0' }, partner: { name: 'Partner', hex: '#F2766B' }, twins: { name: 'Twins', hex: '#8E6CE0' } };

/** Board Widgets (afternoon): Admin, three things in the next 2 hours, one of them Admin's private dentist. */
export const WIDGET_ADMIN_AFTERNOON: WidgetTimeline = {
  generatedAt: thu(15, 40),
  mega: TEAL,
  kid: false,
  talkLink: LINKS.talk(),
  entries: [
    {
      at: thu(15, 40),
      kind: 'soon',
      link: LINKS.today(),
      soon: [
        { title: 'Dentist', startsAt: thu(16), timeLabel: '4:00 PM', who: [WHO.you], private: true },
        { title: 'Soccer practice', startsAt: thu(16, 30), timeLabel: '4:30 PM', who: [WHO.twins], private: false },
        { title: 'Soccer pickup', startsAt: thu(17, 30), timeLabel: '5:30 PM', who: [WHO.partner], private: false },
      ],
    },
    {
      at: thu(16, 10),
      kind: 'soon',
      link: LINKS.today(),
      soon: [
        { title: 'Soccer practice', startsAt: thu(16, 30), timeLabel: '4:30 PM', who: [WHO.twins], private: false },
        { title: 'Soccer pickup', startsAt: thu(17, 30), timeLabel: '5:30 PM', who: [WHO.partner], private: false },
      ],
    },
    { at: thu(17, 40), kind: 'statement', link: LINKS.chat(), statement: { text: 'Recycling goes out Tuesday. Want a reminder Monday night?', short: 'Recycling goes out Tuesday' } },
    { at: thu(23, 40), kind: 'stale', link: LINKS.today() },
  ],
};

/** Board WidgetsEvening: nothing soon → the MEGA's top statement. */
export const WIDGET_ADMIN_EVENING: WidgetTimeline = {
  generatedAt: thu(20, 15),
  mega: TEAL,
  kid: false,
  talkLink: LINKS.talk(),
  entries: [
    { at: thu(20, 15), kind: 'statement', link: LINKS.chat(), statement: { text: 'Recycling goes out Tuesday. Want a reminder Monday night?', short: 'Recycling goes out Tuesday' } },
    { at: thu(23, 59), kind: 'stale', link: LINKS.today() },
  ],
};

/** Board WidgetsKid: Twin 1's widget, Zap, only the events Twin 1 is in (never anyone's private layer). */
export const WIDGET_KID: WidgetTimeline = {
  generatedAt: thu(15, 40),
  mega: ZAP,
  kid: true,
  talkLink: LINKS.talk(),
  entries: [
    { at: thu(15, 40), kind: 'soon', link: LINKS.today(), soon: [{ title: 'Soccer practice', startsAt: thu(16, 30), timeLabel: '4:30 PM', who: [WHO.twins], private: false }] },
    { at: thu(16, 40), kind: 'statement', link: LINKS.chat(), statement: { text: 'Reading time is done. Want to pick a book for tomorrow?', short: 'Pick a book for tomorrow?' } },
  ],
};

/** Nothing at all: one honest "empty" entry. */
export const WIDGET_EMPTY: WidgetTimeline = {
  generatedAt: thu(9),
  mega: TEAL,
  kid: false,
  talkLink: LINKS.talk(),
  entries: [{ at: thu(9), kind: 'empty', link: LINKS.today() }],
};

/** Scanner inputs: the only accepted forms, and things that must be refused (never opened). */
export const SCAN_TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef';
export const SCAN_GOOD = [LINKS.join(SCAN_TOKEN), `${LINKS.join(SCAN_TOKEN)}/`, SCAN_TOKEN];
export const SCAN_BAD = [
  'https://example.com/join/0123456789abcdef0123456789abcdef0123456789abcdef',
  'https://example.com/phish',
  'mega://chat',
  'mega://join/not-a-token',
  'WIFI:S:home;T:WPA;P:secret;;',
  '',
];
