// G8 (CONTRACT v0.18 §6, G8.md frontend task 1; invariants 3 and 9): turns a `widgets.next` timeline into the
// MegaNext / MegaTalk props and writes them to the widgets. The widgets themselves can't fetch or read config
// (expo-widgets SDK 58), so every color, line of copy and the MEGA's head picture are baked into the props here.
//
// - `updateTimeline` gets one entry per server entry (`date` = the entry's `at`); WidgetKit swaps them in on
//   time, so the widget stays right for `WIDGET_TIMELINE.horizonHours` with the app closed, then shows the
//   honest stale entry.
// - Sign-out or an account switch writes the signed-out props FIRST, before anything else (invariant 3).
// - iOS only: everywhere else (web, Android with widgets off, tests that don't care) it's a no-op (invariant 9).
import { Platform } from 'react-native';
import { fillCopy, G8_COPY, G8_UI_COPY } from '@shared/config/copy';
import { WIDGET_TIMELINE, WIDGETS_ANDROID } from '@shared/config/widgets';
import type { ThemeTokens } from '@shared/config/theme';
import type { StickerId } from '@shared/config/looks';
import type { WidgetTimeline } from '@shared/domain/api';
import { LINKS } from '@shared/domain/api';
import { renderMega, type ExpressionName, type Picture } from '@shared/sprite';
import type { HeadRow, MegaNextProps, MegaTalkProps, WidgetColors, WidgetCopy } from '@/widgets/types';

/** The pixel size of the MEGA head on the widgets (the badge picture, in points per pixel). */
export const WIDGET_HEAD_PX = 2;

export function widgetColors(tokens: ThemeTokens): WidgetColors {
  return { bg: tokens.bg, surface: tokens.surface, text: tokens.text, muted: tokens.muted, accent: tokens.accent, line: tokens.line, warn: tokens.warn };
}

export function widgetCopy(megaName: string): WidgetCopy {
  return {
    soonTitle: G8_COPY.widgetSoonTitle,
    says: fillCopy(G8_COPY.widgetSaysTitle, { mega: megaName }),
    tapToReply: G8_COPY.widgetTapToReply,
    noSoon: G8_COPY.widgetNoSoon,
    tip: G8_COPY.widgetTip,
    now: G8_COPY.widgetNow,
    inMinutes: G8_COPY.widgetInMinutes,
    inHours: G8_COPY.widgetInHours,
    private: G8_COPY.widgetPrivate,
    empty: G8_COPY.widgetEmpty,
    stale: fillCopy(G8_COPY.widgetStale, { mega: megaName }),
    lastChecked: G8_UI_COPY.widgetLastChecked,
    lastCheckedOne: G8_UI_COPY.widgetLastCheckedOne,
    signedOut: G8_COPY.widgetSignedOut,
    signedOutFoot: G8_UI_COPY.widgetSignedOutFoot,
    talk: G8_COPY.widgetTalk,
  };
}

/** A picture as rows of horizontal color runs (`''` = transparent), the shape the widget draws. */
export function headRows(picture: Picture): HeadRow[] {
  const rows: HeadRow[] = [];
  for (let y = 0; y < picture.h; y++) {
    const row: HeadRow = [];
    for (let x = 0; x < picture.w; x++) {
      const color = picture.px[y * picture.w + x] ?? '';
      const last = row[row.length - 1];
      if (last && last[1] === color) last[0] += 1;
      else row.push([1, color]);
    }
    rows.push(row);
  }
  return rows;
}

function megaHead(hex: string, sticker: string, face: string): HeadRow[] {
  return headRows(renderMega({ shell: hex, sticker: sticker as StickerId }, { badge: true, expression: face as ExpressionName }));
}

/** The signed-out widgets' sleeping grey MEGA (board WidgetsSignedOut): nobody's MEGA, nothing personal. */
function sleepingHead(colors: WidgetColors): HeadRow[] {
  return megaHead(colors.muted, 'none', 'closed');
}

/** The timeline's entries as widget timeline entries, in order, at most `WIDGET_TIMELINE.maxEntries`. */
export function nextEntries(timeline: WidgetTimeline, colors: WidgetColors): { date: Date; props: MegaNextProps }[] {
  const head = megaHead(timeline.mega.hex, timeline.mega.sticker, timeline.mega.face);
  const copy = widgetCopy(timeline.mega.name);
  return [...timeline.entries]
    .sort((a, b) => a.at - b.at)
    .slice(0, WIDGET_TIMELINE.maxEntries)
    .map((e) => ({
      date: new Date(e.at),
      props: {
        state: e.kind,
        at: e.at,
        generatedAt: timeline.generatedAt,
        kid: timeline.kid,
        megaName: timeline.mega.name,
        megaHex: timeline.mega.hex,
        head,
        soon: (e.soon ?? []).slice(0, WIDGET_TIMELINE.maxSoon).map((s) => ({ title: s.title, startsAt: s.startsAt, timeLabel: s.timeLabel, who: s.who[0]?.hex ?? colors.muted, private: s.private })),
        statement: e.statement?.text ?? '',
        statementShort: e.statement?.short ?? '',
        link: e.link,
        colors,
        copy,
      },
    }));
}

/** Signed out, or between accounts: no events, no statement, no MEGA name — just "Open MEGA to sign in". */
export function signedOutNext(colors: WidgetColors, at: number): MegaNextProps {
  return {
    state: 'signedOut',
    at,
    generatedAt: at,
    kid: false,
    megaName: '',
    megaHex: colors.muted,
    head: sleepingHead(colors),
    soon: [],
    statement: '',
    statementShort: '',
    link: LINKS.chat(),
    colors,
    copy: widgetCopy(''),
  };
}

export function talkProps(timeline: WidgetTimeline, colors: WidgetColors): MegaTalkProps {
  return { signedOut: false, megaName: timeline.mega.name, head: megaHead(timeline.mega.hex, timeline.mega.sticker, timeline.mega.face), link: timeline.talkLink, colors, copy: { talk: G8_COPY.widgetTalk, signedOut: G8_COPY.widgetSignedOut } };
}

export function signedOutTalk(colors: WidgetColors): MegaTalkProps {
  return { signedOut: true, megaName: '', head: sleepingHead(colors), link: LINKS.chat(), colors, copy: { talk: G8_COPY.widgetTalk, signedOut: G8_COPY.widgetSignedOut } };
}

type NextWidget = { updateTimeline: (entries: { date: Date; props: MegaNextProps }[]) => void; updateSnapshot: (props: MegaNextProps) => void };
type TalkWidget = { updateSnapshot: (props: MegaTalkProps) => void };

/** Whether this platform has widgets at all (iOS; Android only once WIDGETS_ANDROID is on). */
export function widgetsSupported(os: string = Platform.OS): boolean {
  return os === 'ios' || (os === 'android' && WIDGETS_ANDROID);
}

/**
 * The app's writer for both widgets. `write` pushes a member's timeline (throttled to `minRefreshSeconds`
 * unless `force`, e.g. on foreground or sign-in). It remembers whose timeline is on the widgets: a write for
 * a different member (an account switch) first writes the signed-out props, then the new timeline
 * unthrottled (invariant 3). `signOut` writes the signed-out props right away and forgets the member.
 */
export function createWidgetWriter({ next, talk, os = Platform.OS, now = () => Date.now() }: { next: NextWidget; talk: TalkWidget; os?: string; now?: () => number }) {
  let lastWrite = -Infinity;
  let shownMember: string | null = null;
  const enabled = widgetsSupported(os);
  const clear = (colors: WidgetColors) => {
    lastWrite = -Infinity;
    shownMember = null;
    next.updateSnapshot(signedOutNext(colors, now()));
    talk.updateSnapshot(signedOutTalk(colors));
  };
  return {
    write(timeline: WidgetTimeline, colors: WidgetColors, { memberId, force = false }: { memberId: string; force?: boolean }): boolean {
      if (!enabled) return false;
      if (shownMember !== null && shownMember !== memberId) clear(colors);
      const t = now();
      if (!force && shownMember === memberId && t - lastWrite < WIDGET_TIMELINE.minRefreshSeconds * 1000) return false;
      lastWrite = t;
      shownMember = memberId;
      next.updateTimeline(nextEntries(timeline, colors));
      talk.updateSnapshot(talkProps(timeline, colors));
      return true;
    },
    signOut(colors: WidgetColors): void {
      if (!enabled) return;
      clear(colors);
    },
  };
}
