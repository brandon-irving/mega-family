// One shared row of equal-weight action buttons for notification/request cards — used by both the chat
// thread (Cards.tsx) and Today's "waiting on you" section (TodayContent.tsx), so there's exactly one
// place that decides how these render (DRY, G1 fix #3). It never reorders what it's given: buttons
// always render in the array order passed in, which for a real notification is the order stored on it
// (itself copied from `BUTTON_SETS` in config — shared/config/notifications.ts — at send time), so
// changing a button set's order is a config edit, never a per-screen one.
//
// G3 review fix (HIGH, kid button sizes): sized from the viewer's role (tokens.buttonSize, resolved from
// shared/config/theme.ts BUTTON_SIZES — the design board's `SIZES`), never a per-call magic number.
//
// Owner, Oct 28: stacked buttons came out content-width. Rows are now explicit lines (no percentage
// flexBasis + wrap, which shrink-wrapped on web): short labels pair up and split a line evenly; a stacked
// button — an odd one out, or every button when a label is too long to pair — fills the whole width.
// The thresholds are config (BUTTON_ROW_LAYOUT).
import { View } from 'react-native';
import { BUTTON_ROW_LAYOUT } from '@shared/config/theme';
import { Button } from './Button';
import { useTokens } from './theme';

export type ButtonRowButton = { id: string; label: string };

export type ButtonRowProps = {
  buttons: readonly ButtonRowButton[];
  onPress: (buttonId: string) => void;
  disabled?: boolean;
  loadingButtonId?: string;
};

/** Splits buttons into display lines, in order: pairs when every label is short, else one per line. */
export function buttonLines<T extends ButtonRowButton>(buttons: readonly T[]): T[][] {
  const perLine = buttons.every((b) => b.label.length <= BUTTON_ROW_LAYOUT.pairMaxChars) ? BUTTON_ROW_LAYOUT.perRow : 1;
  const lines: T[][] = [];
  for (let i = 0; i < buttons.length; i += perLine) lines.push(buttons.slice(i, i + perLine));
  return lines;
}

export function ButtonRow({ buttons, onPress, disabled, loadingButtonId }: ButtonRowProps) {
  const tokens = useTokens();
  return (
    <View style={{ alignSelf: 'stretch', gap: tokens.spacing.sm }}>
      {buttonLines(buttons).map((line) => (
        <View key={line.map((b) => b.id).join('|')} testID="button-row-line" style={{ width: '100%', flexDirection: 'row', gap: tokens.spacing.sm }}>
          {line.map((b) => (
            <Button key={b.id} label={b.label} variant="secondary" disabled={disabled} loading={loadingButtonId === b.id} onPress={() => onPress(b.id)} size={tokens.buttonSize} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}
