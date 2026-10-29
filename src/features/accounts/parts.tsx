// Pieces the G5 connect cards and the Connected accounts page share (canvas Screen 16): the rounded icon tile,
// the status pill with its dot, a tappable option row (dashed and not tappable when it isn't available), the
// schedule-link field (a visible label, `aria-invalid` and an alert-role error under it) and the 44pt × remove
// button. Colors from theme tokens only.
import type { ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { G8_UI_COPY } from '@shared/config/copy';
import { PASTE_BUTTON_WIDTH, PasteButton } from '@/ui/PasteButton';
import { Text } from '@/ui/Text';
import { useTokens, type Tokens } from '@/ui/theme';
import { Glyph, type GlyphName } from '@/features/integrations/glyphs';
import type { Tone } from './accountFormat';

export function toneOf(tokens: Tokens, tone: Tone): string {
  return tone === 'ok' ? tokens.success : tone === 'warn' ? tokens.warn : tone === 'danger' ? tokens.danger : tokens.muted;
}

export function IconTile({ icon, tone = 'accent', size = 40 }: { icon: GlyphName; tone?: 'accent' | 'household' | 'bucks' | 'danger' | 'muted'; size?: number }) {
  const tokens = useTokens();
  const [bg, ink] =
    tone === 'household'
      ? [tokens.householdSurface, tokens.householdText]
      : tone === 'bucks'
        ? [tokens.bucksSurface, tokens.bucks]
        : tone === 'danger'
          ? [tokens.dangerSurface, tokens.dangerText]
          : tone === 'muted'
            ? [tokens.line, tokens.muted]
            : [tokens.hintSurface, tokens.accent];
  return (
    <View style={{ width: size, height: size, borderRadius: tokens.radii.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Glyph name={icon} color={ink} size={size * 0.5} stroke={2} />
    </View>
  );
}

export function StatusPill({ text, tone }: { text: string; tone: Tone }) {
  const tokens = useTokens();
  const color = toneOf(tokens, tone);
  return (
    <View accessibilityRole="text" accessibilityLabel={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text variant="caption" weight="700" numberOfLines={1} style={{ color, flexShrink: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/** One choice on a card (Google Calendar / This phone's calendar). `off` draws it dashed and not tappable. */
export function OptionRow({ icon, label, sub, off, onPress, loading }: { icon: GlyphName; label: string; sub: string; off?: boolean; onPress?: () => void; loading?: boolean }) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={off || loading ? undefined : onPress}
      disabled={off || loading}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${sub}`}
      accessibilityState={{ disabled: !!off || !!loading, busy: !!loading }}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing.md,
        paddingHorizontal: tokens.spacing.md,
        paddingVertical: tokens.spacing.sm,
        borderRadius: tokens.radii.lg,
        borderWidth: 1,
        borderStyle: off ? 'dashed' : 'solid',
        borderColor: tokens.line,
        backgroundColor: pressed ? tokens.bg : 'transparent',
        opacity: off ? 0.6 : loading ? 0.7 : 1,
      })}
    >
      <IconTile icon={icon} tone={off ? 'muted' : 'accent'} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{label}</Text>
        <Text variant="caption" color="muted">
          {sub}
        </Text>
      </View>
      {off ? null : <Glyph name="chevron" color={tokens.muted} size={16} />}
    </Pressable>
  );
}

/** The schedule-link field (boards IcsPaste / IcsPasteError). */
export function LinkField({ label, value, placeholder, error, onChange, onSubmit, testID }: { label: string; value: string; placeholder: string; error?: string | null; onChange: (t: string) => void; onSubmit: () => void; testID?: string }) {
  const tokens = useTokens();
  // `aria-invalid` reaches the DOM on web (react-native-web); RN's types don't list it yet.
  const invalid = { 'aria-invalid': error ? 'true' : 'false' } as object;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="caption" weight="700" color="muted">
        {label.toUpperCase()}
      </Text>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor={tokens.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
          returnKeyType="go"
          accessibilityLabel={label}
          {...invalid}
          style={{
            height: 48,
            color: tokens.text,
            paddingLeft: tokens.spacing.md,
            // G8: room for the Paste button inside the field's right edge (same control as the invite field).
            paddingRight: PASTE_BUTTON_WIDTH + tokens.spacing.md,
            borderRadius: tokens.radii.md,
            borderWidth: 1,
            borderColor: error ? tokens.danger : tokens.line,
            backgroundColor: tokens.bg,
            minWidth: 0,
          }}
        />
        <View style={{ position: 'absolute', right: tokens.spacing.sm, top: 0, bottom: 0, justifyContent: 'center' }}>
          <PasteButton label={G8_UI_COPY.pasteLinkLabel} onPasted={(text) => text.trim() && onChange(text.trim())} />
        </View>
      </View>
      {error ? (
        <Text accessibilityRole="alert" variant="caption" style={{ color: tokens.dangerText }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** The 44pt × on a found-mail row. */
export function RemoveButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const tokens = useTokens();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={tokens.hitSlop} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <Glyph name="close" color={tokens.muted} size={16} />
    </Pressable>
  );
}

/** A labelled row inside a card's list (found mail): tile, title + sub, then a trailing control. */
export function ListRow({ icon, tile, title, sub, trailing, first }: { icon: GlyphName; tile?: 'accent' | 'household' | 'bucks' | 'danger' | 'muted'; title: string; sub: string; trailing?: ReactNode; first?: boolean }) {
  const tokens = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderTopWidth: first ? 0 : 1, borderTopColor: tokens.line }}>
      <IconTile icon={icon} tone={tile} size={36} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text variant="label">{title}</Text>
        {sub ? (
          <Text variant="caption" color="muted">
            {sub}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}
