// The settings-style rows the Settings, Rules and limits and Activity pages share (canvas Screen 7 Settings and
// Screen 16 ProfileRules / ProfileActivity): a titled section card with dividers, a tappable link row (label,
// hint, value, chevron), a locked row ("Set by a parent" with a lock), a switch, a 44pt − / + stepper, a
// one-line segmented choice and one-line chips. Kid sizing comes from the theme (`tokens.touchTarget` and
// `tokens.buttonSize` follow the role). Colors from tokens only.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { readableOn } from '@shared/config/theme';
import { Text } from '@/ui/Text';
import { LockGlyph } from '@/ui/ThreadCard';
import { useTokens } from '@/ui/theme';
import { Glyph } from '@/features/integrations/glyphs';

export function SettingsSection({ title, note, foot, children, testID }: { title?: string; note?: string; foot?: ReactNode; children: ReactNode; testID?: string }) {
  const tokens = useTokens();
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={{ gap: tokens.spacing.xs }} testID={testID}>
      {title ? (
        <Text variant="caption" weight="700" color="muted" accessibilityRole="header">
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={{ backgroundColor: tokens.surface, borderRadius: tokens.radii.xl, borderWidth: 1, borderColor: tokens.line, overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: tokens.line }}>
            {row}
          </View>
        ))}
      </View>
      {note ? (
        <Text variant="caption" color="muted">
          {note}
        </Text>
      ) : null}
      {foot}
    </View>
  );
}

const rowPad = (tokens: ReturnType<typeof useTokens>) => ({ minHeight: Math.max(52, tokens.touchTarget + 8), paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.sm });

export function LinkRow({ label, hint, value, leading, onPress, accessibilityLabel }: { label: string; hint?: string; value?: string; leading?: ReactNode; onPress: () => void; accessibilityLabel?: string }) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [label, value].filter(Boolean).join(', ')}
      accessibilityHint={hint}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: pressed ? tokens.bg : 'transparent' }, rowPad(tokens)]}
    >
      {leading}
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text variant="label">{label}</Text>
        {hint ? (
          <Text variant="caption" color="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text color="muted" numberOfLines={1} style={{ flexShrink: 1, maxWidth: '50%', textAlign: 'right' }}>
          {value}
        </Text>
      ) : null}
      <Glyph name="chevron" color={tokens.muted} size={16} />
    </Pressable>
  );
}

export function LockedRow({ label, locked, value, hint }: { label: string; locked: string; value: string; hint?: string }) {
  const tokens = useTokens();
  return (
    <View accessible accessibilityLabel={`${label}, ${value}. ${locked}`} style={[{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }, rowPad(tokens)]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{label}</Text>
        {hint ? (
          <Text variant="caption" color="muted">
            {hint}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <LockGlyph color={tokens.muted} size={11} />
          <Text variant="caption" color="muted">
            {locked}
          </Text>
        </View>
      </View>
      <Text color="muted">{value}</Text>
    </View>
  );
}

export function ValueRow({ label, hint, value }: { label: string; hint?: string; value: string }) {
  const tokens = useTokens();
  return (
    <View accessible accessibilityLabel={`${label}, ${value}`} style={[{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }, rowPad(tokens)]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{label}</Text>
        {hint ? (
          <Text variant="caption" color="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Text color="muted">{value}</Text>
    </View>
  );
}

export function SwitchRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, opacity: disabled ? 0.6 : 1 }, rowPad(tokens)]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{label}</Text>
        {hint ? (
          <Text variant="caption" color="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: value ? tokens.accent : tokens.line, justifyContent: 'center' }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, marginLeft: value ? 23 : 3, backgroundColor: value ? readableOn(tokens.accent) : tokens.text }} />
      </View>
    </Pressable>
  );
}

export function StepperRow({ label, hint, value, onLess, onMore, lessLabel, moreLabel, canLess = true, canMore = true }: { label: string; hint?: string; value: string; onLess: () => void; onMore: () => void; lessLabel: string; moreLabel: string; canLess?: boolean; canMore?: boolean }) {
  const tokens = useTokens();
  const round = (enabled: boolean) => ({ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: tokens.line, alignItems: 'center' as const, justifyContent: 'center' as const, opacity: enabled ? 1 : 0.4 });
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }, rowPad(tokens)]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{label}</Text>
        {hint ? (
          <Text variant="caption" color="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Pressable onPress={onLess} disabled={!canLess} accessibilityRole="button" accessibilityLabel={lessLabel} style={round(canLess)}>
        <Text variant="title">−</Text>
      </Pressable>
      <Text variant="label" accessibilityLiveRegion="polite" style={{ minWidth: 64, textAlign: 'center' }}>
        {value}
      </Text>
      <Pressable onPress={onMore} disabled={!canMore} accessibilityRole="button" accessibilityLabel={moreLabel} style={round(canMore)}>
        <Text variant="title">+</Text>
      </Pressable>
    </View>
  );
}

export function SegmentRow<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const tokens = useTokens();
  return (
    <View style={[{ gap: tokens.spacing.sm }, rowPad(tokens)]}>
      <Text variant="label">{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 6, borderRadius: tokens.radii.pill, borderWidth: 1, borderColor: tokens.line, padding: 3 }}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <Pressable
              key={o.id}
              onPress={() => onChange(o.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, selected: on }}
              accessibilityLabel={`${label}: ${o.label}`}
              style={{ flex: 1, height: 40, borderRadius: tokens.radii.pill, backgroundColor: on ? tokens.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text variant="label" numberOfLines={1} style={{ color: on ? tokens.bg : tokens.text }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** One line of chips that scrolls sideways (owner, Oct 28: chips never wrap). */
export function ChipLine({ chips, onPress, selected }: { chips: { id: string; label: string }[]; onPress?: (id: string) => void; selected?: string }) {
  const tokens = useTokens();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} testID="chip-line">
      {chips.map((c) => {
        const on = c.id === selected;
        const body = (
          <Text variant="label" numberOfLines={1} style={{ color: on ? tokens.bg : tokens.text }}>
            {c.label}
          </Text>
        );
        const style = { flexShrink: 0, minHeight: 36, paddingHorizontal: tokens.spacing.md, borderRadius: tokens.radii.pill, borderWidth: 1, borderColor: on ? tokens.text : tokens.line, backgroundColor: on ? tokens.text : 'transparent', justifyContent: 'center' as const };
        return onPress ? (
          <Pressable key={c.id} onPress={() => onPress(c.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={c.label} hitSlop={4} style={style}>
            {body}
          </Pressable>
        ) : (
          <View key={c.id} style={style}>
            {body}
          </View>
        );
      })}
    </ScrollView>
  );
}

/** "10:00 PM" for "22:00" (a local wall-clock time; no timezone math). */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Move "HH:MM" by `minutes`, wrapping round the day. */
export function shiftClock(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
