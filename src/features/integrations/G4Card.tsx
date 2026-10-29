// The Screen 14/15 boards' card frame: surface, line, xl radius, a colored "from" line with its icon, then the
// content. G4's search/weather/travel cards use the bare frame; G4b's shopping, price-drop, tip and holiday cards
// (canvas row "Screen 15 · Shopping, air and holidays") add the title/body block, a status line and the lock
// footnote through `IconCard`, the same order as the boards (title → content → buttons → status → foot).
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/ui/Text';
import { LockNote } from '@/ui/ThreadCard';
import { useTokens } from '@/ui/theme';
import { Glyph, type GlyphName } from './glyphs';

export function G4Card({ label, from, fromIcon, fromColor, children, testID }: { label: string; from?: string; fromIcon?: GlyphName; fromColor?: string; children: ReactNode; testID?: string }) {
  const tokens = useTokens();
  return (
    <View
      testID={testID}
      accessibilityLabel={label}
      style={{ alignSelf: 'stretch', backgroundColor: tokens.surface, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg, gap: tokens.spacing.md }}
    >
      {from ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
          {fromIcon ? <Glyph name={fromIcon} color={fromColor ?? tokens.accent} size={14} stroke={2.4} /> : null}
          <Text variant="caption" weight="700" style={{ color: fromColor ?? tokens.accent, flexShrink: 1 }}>
            {from}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

export type IconCardStatus = { text: string; color: string };

export function IconCard({
  from,
  icon,
  title,
  body,
  children,
  status,
  foot,
  testID,
}: {
  from: string;
  icon: GlyphName;
  title?: string;
  body?: string;
  children?: ReactNode;
  status?: IconCardStatus | null;
  foot?: string;
  testID?: string;
}) {
  const tokens = useTokens();
  return (
    <G4Card label={title ? `${from}. ${title}` : from} from={from} fromIcon={icon} testID={testID}>
      {title ? (
        <View style={{ gap: tokens.spacing.xs }}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {body ? <Text color="muted">{body}</Text> : null}
        </View>
      ) : null}
      {children}
      {status ? (
        <View accessibilityRole="text" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: status.color }} />
          <Text variant="label" style={{ color: status.color, flex: 1 }}>
            {status.text}
          </Text>
        </View>
      ) : null}
      {foot ? <LockNote text={foot} /> : null}
    </G4Card>
  );
}
