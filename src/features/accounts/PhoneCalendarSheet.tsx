// Board PhoneCalendarPick: after the phone's permission, the owner picks which of the phone's calendars MEGA
// reads (checkbox rows: the calendar's own color dot, name, account), with the private-layer note and one
// full-width button ("Add 2 calendars", or "Pick at least one" when none are picked). A bottom sheet that
// closes every way (ModalSheet). The calendars come from expo-calendar (src/services/phoneCalendar.ts).
import { Pressable, View } from 'react-native';
import { G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import type { PhoneCalendar } from '@/services/phoneCalendar';
import { Button } from '@/ui/Button';
import { ModalSheet } from '@/ui/ModalSheet';
import { Text } from '@/ui/Text';
import { LockNote } from '@/ui/ThreadCard';
import { readableOn } from '@shared/config/theme';
import { useTokens } from '@/ui/theme';
import { Glyph } from '@/features/integrations/glyphs';

export function addLabel(n: number): string {
  if (n === 0) return U.pickNone;
  return n === 1 ? U.pickAddOne : fillCopy(U.pickAddMany, { n });
}

export function PhoneCalendarSheet({
  open,
  calendars,
  picks,
  busy,
  onToggle,
  onAdd,
  onClose,
}: {
  open: boolean;
  calendars: PhoneCalendar[];
  picks: string[];
  busy?: boolean;
  onToggle: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const tokens = useTokens();
  return (
    <ModalSheet open={open} title={U.pickTitle} closeLabel={U.close} onClose={onClose} testID="phone-calendar-sheet">
      <Text color="muted">{U.pickBody}</Text>
      {calendars.length === 0 ? (
        <Text>{U.pickEmpty}</Text>
      ) : (
        <View style={{ borderRadius: tokens.radii.lg, borderWidth: 1, borderColor: tokens.line, overflow: 'hidden' }}>
          {calendars.map((c, i) => {
            const on = picks.includes(c.id);
            return (
              <Pressable
                key={c.id}
                onPress={() => onToggle(c.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={c.source ? `${c.label}, ${c.source}` : c.label}
                style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingHorizontal: tokens.spacing.md, borderTopWidth: i ? 1 : 0, borderTopColor: tokens.line }}
              >
                <View style={{ width: 24, height: 24, borderRadius: tokens.radii.sm, borderWidth: 2, borderColor: on ? tokens.accent : tokens.muted, backgroundColor: on ? tokens.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Glyph name="check" color={readableOn(tokens.accent)} size={14} stroke={3} /> : null}
                </View>
                {/* The calendar's own color, as the phone reports it (data, not a design color). */}
                {c.color ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color }} /> : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label">{c.label}</Text>
                  {c.source ? (
                    <Text variant="caption" color="muted">
                      {c.source}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      <LockNote text={U.pickFoot} />
      <Button label={addLabel(picks.length)} onPress={onAdd} disabled={picks.length === 0 || busy} loading={busy} style={{ alignSelf: 'stretch' }} />
    </ModalSheet>
  );
}
