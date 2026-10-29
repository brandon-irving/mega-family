// G8 (CONTRACT v0.18 §6; boards Widgets, WidgetsEvening, WidgetsKid*, WidgetsLock*, WidgetsThree,
// WidgetsLockPrivate, WidgetsKidSafe, WidgetsEmpty, WidgetsStale, WidgetsSignedOut; canvas v41): the
// "Coming up" widget, kind `WIDGETS.next` (systemSmall, systemMedium, accessoryRectangular).
//
// expo-widgets (SDK 58): a `'widget'` function is serialized by babel-preset-expo's widgets plugin and run
// in the widget extension with only @expo/ui's SwiftUI components and modifiers in scope. So every helper
// lives inside the function, everything it shows arrives in props (src/services/widgetSync.ts), and the
// code avoids anything babel would turn into a helper import (object/array spread, for…of). The relative
// times ("in 20 min") are worked out here from each row's absolute `startsAt` and WidgetKit's entry date.
//
// Lock screen privacy (decision 3, invariant 2): on accessory families or vibrant rendering, a private
// event's title is replaced by "Private event"; its title view is `privacySensitive` everywhere, so iOS
// redacts it while the phone is locked. No accessoryInline family in this build (decision 4).
import { Circle, HStack, Image, Rectangle, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, lineLimit, opacity, padding, privacySensitive, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { WIDGETS } from '@shared/config/widgets';
import { initialNextProps } from '@/services/widgetSync';
import type { MegaNextProps, WidgetSoonRow } from './types';

export const MegaNextLayout = (props: MegaNextProps, environment: WidgetEnvironment) => {
  'widget';
  const c = props.colors;
  const copy = props.copy;
  const family = environment.widgetFamily || 'systemSmall';
  const lock = family.indexOf('accessory') === 0 || environment.widgetRenderingMode === 'vibrant';
  const now = environment.date ? environment.date.getTime() : props.at;
  const fill = (template: string, n: number) => template.replace('{n}', String(n));

  const relative = (startsAt: number) => {
    const minutes = Math.round((startsAt - now) / 60000);
    if (minutes <= 0) return copy.now;
    if (minutes < 60) return fill(copy.inMinutes, minutes);
    return fill(copy.inHours, Math.floor(minutes / 60));
  };
  // The small widget's tag has no "in " (board Widgets: "40 min", "1h").
  const tag = (startsAt: number) => {
    const minutes = Math.round((startsAt - now) / 60000);
    if (minutes <= 0) return copy.now;
    if (minutes < 60) return fill(copy.tagMinutes, minutes);
    return fill(copy.tagHours, Math.floor(minutes / 60));
  };
  const kicker = (row: WidgetSoonRow) => row.timeLabel + ' · ' + relative(row.startsAt);
  const titleOf = (row: WidgetSoonRow) => (lock && row.private ? copy.private : row.title);
  const lastChecked = () => {
    const hours = Math.max(1, Math.round((now - props.generatedAt) / 3600000));
    return hours === 1 ? copy.lastCheckedOne : fill(copy.lastChecked, hours);
  };

  const label = (text: string, pt: number, color: string, weight: 'regular' | 'semibold' | 'bold', lines: number, sensitive: boolean) => (
    <Text modifiers={[font({ size: pt, weight }), foregroundStyle(color), lineLimit(lines), privacySensitive(sensitive)]}>{text}</Text>
  );
  const head = (px: number) => (
    <VStack spacing={0}>
      {props.head.map((row, y) => (
        <HStack key={'h' + y} spacing={0}>
          {row.map((run, x) => (
            <Rectangle key={'h' + y + '-' + x} modifiers={[frame({ width: run[0] * px, height: px }), foregroundStyle(run[1] || c.bg), opacity(run[1] ? 1 : 0)]} />
          ))}
        </HStack>
      ))}
    </VStack>
  );
  const shell = (content: React.JSX.Element) => (
    <VStack alignment="leading" spacing={4} modifiers={[padding({ all: lock ? 0 : 2 }), containerBackground(c.bg, 'widget'), widgetURL(props.link)]}>
      {content}
    </VStack>
  );

  // Lock screen (accessoryRectangular, or anything in vibrant mode): two short lines.
  if (lock) {
    if (props.state === 'soon' && props.soon.length > 0) {
      const first = props.soon[0];
      return shell(
        <VStack alignment="leading" spacing={1}>
          {label(kicker(first), 12, c.muted, 'semibold', 1, false)}
          {label(titleOf(first), 15, c.text, 'bold', 2, first.private)}
        </VStack>,
      );
    }
    if (props.state === 'statement') {
      return shell(
        <VStack alignment="leading" spacing={1}>
          {label(copy.says, 12, c.muted, 'semibold', 1, false)}
          {label(props.statementShort, 15, c.text, 'bold', 2, props.redactStatement)}
        </VStack>,
      );
    }
    const line = props.state === 'signedOut' ? copy.signedOut : props.state === 'stale' ? copy.stale : copy.empty;
    return shell(label(line, 14, c.text, 'semibold', 2, false));
  }

  // Home screen, signed out: a sleeping grey MEGA and the sign-in line (board WidgetsSignedOut).
  if (props.state === 'signedOut') {
    return shell(
      <VStack alignment="leading" spacing={6}>
        {head(2)}
        {label(copy.signedOut, 15, c.text, 'bold', 2, false)}
        {family === 'systemMedium' ? label(copy.signedOutFoot, 12, c.muted, 'regular', 2, false) : null}
      </VStack>,
    );
  }

  // Home screen, nothing soon / gone stale: a calm line, never blank, no Tip tag (WidgetsEmpty / WidgetsStale).
  if (props.state === 'empty' || props.state === 'stale') {
    return shell(
      <VStack alignment="leading" spacing={6}>
        <HStack spacing={6}>
          {head(2)}
          {family === 'systemMedium' ? label(props.megaName, 13, c.muted, 'semibold', 1, false) : null}
        </HStack>
        <Spacer />
        {label(props.state === 'empty' ? copy.empty : copy.stale, 15, c.text, 'bold', 3, false)}
        {label(props.state === 'empty' ? copy.noSoon : lastChecked(), 11, c.muted, 'regular', 1, false)}
      </VStack>,
    );
  }

  // A statement from the MEGA (WidgetsEvening): "{mega} says" (medium) or the Tip tag (small).
  if (props.state === 'statement') {
    if (family === 'systemMedium') {
      return shell(
        <VStack alignment="leading" spacing={6}>
          <HStack spacing={6}>
            {head(2)}
            {label(copy.says, 13, c.muted, 'semibold', 1, false)}
          </HStack>
          {label(props.statement, 15, c.text, 'bold', 3, props.redactStatement)}
          <Spacer />
          {label(copy.tapToReply, 12, c.accent, 'semibold', 1, false)}
        </VStack>,
      );
    }
    return shell(
      <VStack alignment="leading" spacing={6}>
        {head(2)}
        {label(copy.tip, 12, c.accent, 'bold', 1, false)}
        {label(props.statementShort, 15, c.text, 'bold', 3, props.redactStatement)}
      </VStack>,
    );
  }

  // Coming up. Small: the first event's time tag and title. Medium: up to three rows (WidgetsThree).
  if (family === 'systemMedium') {
    return shell(
      <VStack alignment="leading" spacing={6}>
        <HStack spacing={6}>
          {head(2)}
          {label(copy.soonTitle, 13, c.muted, 'semibold', 1, false)}
        </HStack>
        {props.soon.map((row, i) => (
          <HStack key={'s' + i} spacing={8}>
            <Circle modifiers={[frame({ width: 8, height: 8 }), foregroundStyle(row.who)]} />
            <VStack alignment="leading" spacing={0}>
              {label(titleOf(row), 14, c.text, 'semibold', 1, row.private)}
              {label(kicker(row), 11, c.muted, 'regular', 1, false)}
            </VStack>
            <Spacer />
            {row.private ? <Image systemName="lock.fill" size={11} color={c.muted} /> : null}
          </HStack>
        ))}
      </VStack>,
    );
  }
  const first = props.soon[0];
  return shell(
    <VStack alignment="leading" spacing={6}>
      {head(2)}
      {first ? label(tag(first.startsAt), 12, c.accent, 'bold', 1, false) : null}
      {first ? label(titleOf(first), props.smallTitlePt, c.text, 'bold', 3, first.private) : label(copy.empty, 15, c.text, 'bold', 3, false)}
      {first ? label(first.timeLabel, 12, c.muted, 'regular', 1, false) : null}
    </VStack>,
  );
};

export const MegaNext = createWidget<MegaNextProps>(WIDGETS.next.name, MegaNextLayout, initialNextProps());
