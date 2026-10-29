// Home and lock screen widgets (PLAN.md → 8. Widgets, decided Oct 25). The kinds are declared here because the
// expo-widgets config plugin bakes each kind into the native widget extension at build time (app.config.ts):
// adding, renaming or removing a kind needs a new native build, while a kind's layout and content are JS.
// Installed ahead of G8 (owner, Oct 28): native packages are planned up front and the build is done once.

export type WidgetFamily = 'systemSmall' | 'systemMedium' | 'systemLarge' | 'accessoryRectangular' | 'accessoryCircular' | 'accessoryInline';

export type WidgetKind = {
  /** The native kind name; also what `createWidget`/`updateTimeline` refer to. Never rename after a build. */
  name: string;
  displayName: string;
  description: string;
  families: readonly WidgetFamily[];
};

export const WIDGETS = {
  /** Small: your MEGA, the next thing coming up (or its top statement) and Talk. Medium: "Coming up · next
   * 2 hours", color-coded by person. Lock screen: the next item. Kids get it too (their events, bigger text). */
  next: {
    name: 'MegaNext',
    displayName: 'Coming up',
    description: 'What’s next for you, from your MEGA.',
    families: ['systemSmall', 'systemMedium', 'accessoryRectangular'],
  },
  /** The round lock screen Talk button; it deep-links to talk mode (a widget can't use the microphone). */
  talk: {
    name: 'MegaTalk',
    displayName: 'Talk to your MEGA',
    description: 'Opens talk mode, already listening.',
    families: ['accessoryCircular'],
  },
} as const satisfies Record<string, WidgetKind>;

/** Android widgets are off for now (iPhone first; `updateTimeline` is iOS-only). Turning this on needs a build. */
export const WIDGETS_ANDROID = false;

/** G8 (CONTRACT v0.18): how the server builds `widgets.next` and how the app writes it into the widget.
 * Widgets refresh only while the app runs (no background-refresh module is in the frozen build), so the
 * server pre-computes a timeline that stays honest for `horizonHours`, then ends on a "check the app" entry. */
export const WIDGET_TIMELINE = {
  /** "Coming up" = events starting within this window of the entry's time (board: "next 2 hours"). */
  soonWindowMinutes: 120,
  /** An event stays on the widget this long after it starts ("now"), then the next one takes over. */
  startedGraceMinutes: 10,
  /** At most this many events on the medium widget (board: 3). Small and lock show the first. */
  maxSoon: 3,
  /** How far ahead the server plans entries; the last entry says to open MEGA for what's next. */
  horizonHours: 8,
  /** Upper bound on timeline entries the app writes (WidgetKit's own budget is per day; keep it small). */
  maxEntries: 12,
  /** Statement text longer than this is cut for the small and lock widgets (`short`). */
  shortStatementChars: 32,
  /** Lock screen: a private event's title is replaced with `G8_COPY.widgetPrivate` and marked
   * `privacySensitive` (iOS redacts it while the phone is locked). Rules only tighten: never turn this off for kids. */
  lockRedactPrivate: true,
  /** A MEGA statement is marked `privacySensitive` on every family, so iOS hides it while the phone is locked
   * (G8 security review: a statement can carry something meant for this member only). Rules only tighten. */
  redactStatements: true,
  /** Kid widgets: only the small widget's title is bigger (board WidgetsKidSafe: 19pt vs 17pt). */
  smallTitlePt: { adult: 17, kid: 19 },
  /** The app refreshes the widget at most this often from a changing subscription (and always on foreground). */
  minRefreshSeconds: 60,
} as const;
