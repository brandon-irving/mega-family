// One shared row of equal-weight action buttons for notification/request cards — used by both the chat
// thread (Cards.tsx) and Today's "waiting on you" section (TodayContent.tsx), so there's exactly one
// place that decides how these render (DRY, G1 fix #3). It never reorders what it's given: buttons
// always render in the array order passed in, which for a real notification is the order stored on it
// (itself copied from `BUTTON_SETS` in config — shared/config/notifications.ts — at send time), so
// changing a button set's order is a config edit, never a per-screen one.
//
// G3 review fix (HIGH, kid button sizes): sized from the viewer's role (tokens.buttonSize, resolved from
// shared/config/theme.ts BUTTON_SIZES — the design board's `SIZES`), never a per-call magic number, and
// laid out 2-up like the board's `grid-template-columns: repeat(2, minmax(0, 1fr))` rather than a single
// wrapped row — `flexBasis` + `flexGrow` approximates that grid in RN's flexbox: two buttons split the
// row evenly with a gap between, an odd one out (or a lone button) stretches to fill its row.
import { View } from 'react-native';
import { Button } from './Button';
import { useTokens } from './theme';

export type ButtonRowButton = { id: string; label: string };

export type ButtonRowProps = {
  buttons: readonly ButtonRowButton[];
  onPress: (buttonId: string) => void;
};

export function ButtonRow({ buttons, onPress }: ButtonRowProps) {
  const tokens = useTokens();
  return (
    <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, flexWrap: 'wrap' }}>
      {buttons.map((b) => (
        <Button key={b.id} label={b.label} variant="secondary" onPress={() => onPress(b.id)} size={tokens.buttonSize} style={{ flexBasis: '45%', flexGrow: 1 }} />
      ))}
    </View>
  );
}
