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
