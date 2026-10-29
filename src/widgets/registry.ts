// G8 (G8.md invariant 9): off iOS there are no widgets (web; Android until WIDGETS_ANDROID). The layouts import
// @expo/ui's SwiftUI views, which load native view managers the moment the module is imported, so they must
// never reach the web bundle: Metro picks registry.ios.ts on iOS and this no-op pair everywhere else. The
// writer (src/services/widgetSync.ts) also skips every write off iOS; these just keep the import safe.
import type { MegaNextProps, MegaTalkProps } from './types';

const noop = () => {};

export const MegaNext = { updateTimeline: noop as (entries: { date: Date; props: MegaNextProps }[]) => void, updateSnapshot: noop as (props: MegaNextProps) => void };
export const MegaTalk = { updateSnapshot: noop as (props: MegaTalkProps) => void };
