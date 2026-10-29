// G8 (CONTRACT v0.18 §6): the props the app hands the two widgets. The widget runtime can't fetch, use hooks,
// or read anything declared outside the widget function (expo-widgets SDK 58: "All data a widget needs must
// come in through its props"), so everything the layouts need — the timeline entry, the MEGA's head picture,
// the theme colors and every line of copy — travels in these props, built by src/services/widgetSync.ts.

/** One row of the MEGA head picture: horizontal runs of `[length, color]`, `''` for transparent. */
export type HeadRow = [number, string][];

/** Theme colors (from the viewer's tokens; widgets never hardcode a color). */
export type WidgetColors = { bg: string; surface: string; text: string; muted: string; accent: string; line: string; warn: string };

export type WidgetCopy = {
  soonTitle: string;
  says: string;
  tapToReply: string;
  noSoon: string;
  tip: string;
  now: string;
  /** `in {n} min` */
  inMinutes: string;
  /** `in {n}h` */
  inHours: string;
  private: string;
  empty: string;
  stale: string;
  /** `Last checked {n} hours ago` */
  lastChecked: string;
  lastCheckedOne: string;
  signedOut: string;
  signedOutFoot: string;
  talk: string;
};

export type WidgetSoonRow = { title: string; startsAt: number; timeLabel: string; who: string; private: boolean };

export type MegaNextProps = {
  state: 'soon' | 'statement' | 'empty' | 'stale' | 'signedOut';
  /** When this entry becomes current (the widget falls back to it when WidgetKit gives no entry date). */
  at: number;
  /** When the server planned the timeline (the stale entry's "Last checked …"). */
  generatedAt: number;
  kid: boolean;
  megaName: string;
  megaHex: string;
  head: HeadRow[];
  soon: WidgetSoonRow[];
  statement: string;
  statementShort: string;
  link: string;
  colors: WidgetColors;
  copy: WidgetCopy;
};

export type MegaTalkProps = {
  signedOut: boolean;
  megaName: string;
  head: HeadRow[];
  link: string;
  colors: WidgetColors;
  copy: Pick<WidgetCopy, 'talk' | 'signedOut'>;
};
