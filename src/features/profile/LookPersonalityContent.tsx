// Look & personality screen (PLAN §3): 6 color presets + custom hex, 4 stickers + none, 4
// personalities each with a sample line, via megas.update. The MEGA blinks here (no floating anim).
import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { COLORS, HEX_RE, PERSONALITIES } from '@shared/config/looks';
import { STICKERS } from '@shared/config/ids';
import type { Personality } from '@shared/domain/enums';
import type { StickerId } from '@shared/config/looks';
import { STORE_CATALOG, type AntennaId, type EyeColorId, type EyeStyleId } from '@shared/config/store';
import { partLabel, type Wardrobe } from './wardrobe';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { errorCopyFor } from '@/data/errorCopy';

export type LookPersonalityValue = { hex: string; sticker: StickerId; personality: Personality; antenna?: AntennaId; eyes?: EyeStyleId; eyeColor?: EyeColorId };

/** `wardrobe` (src/features/profile/wardrobe.ts): what this person may pick, including Store parts. Without it
 * (the join flow's "Change my MEGA") only the preset colors, any hex, the stickers and personality show. */
export type LookPersonalityContentProps = { value: LookPersonalityValue; wardrobe?: Wardrobe; onSave: (value: LookPersonalityValue) => Promise<unknown> | void };

export function LookPersonalityContent({ value, wardrobe, onSave }: LookPersonalityContentProps) {
  const tokens = useTokens();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [hex, setHex] = useState(value.hex);
  const [customHex, setCustomHex] = useState(value.hex);
  const [sticker, setSticker] = useState<StickerId>(value.sticker);
  const [personality, setPersonality] = useState<Personality>(value.personality);
  const [antenna, setAntenna] = useState<AntennaId | undefined>(value.antenna);
  const [eyes, setEyes] = useState<EyeStyleId | undefined>(value.eyes);
  const [eyeColor, setEyeColor] = useState<EyeColorId | undefined>(value.eyeColor);
  const colors = wardrobe?.colors ?? (Object.values(COLORS) as string[]);
  const stickers = wardrobe?.stickers ?? STICKERS;
  const blink = personality ? PERSONALITIES[personality].face : 'open';
  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try { await onSave(wardrobe ? { hex, sticker, personality, antenna, eyes, eyeColor } : { hex, sticker, personality }); }
    catch (err) { setError(errorCopyFor(err)); }
    finally { saving.current = false; setBusy(false); }
  };

  return (
    <>
      <View style={{ alignItems: 'center', padding: tokens.spacing.md, borderRadius: tokens.radii.xl, backgroundColor: tokens.surface, marginBottom: tokens.spacing.lg, gap: tokens.spacing.sm }}>
        <MegaSprite hex={hex} sticker={sticker} parts={{ antenna, eyes, eyeColor }} face={blink} scale={3} />
        <Text variant="caption" color="muted">Make your MEGA feel like yours.</Text>
      </View>

      <Card style={{ marginBottom: tokens.spacing.md }}>
        <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
          Color
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, marginBottom: tokens.spacing.sm }}>
          {colors.map((c) => (
            <Pressable key={c} onPress={() => { setHex(c); setCustomHex(c); }} disabled={busy} accessibilityRole="radio" accessibilityLabel={colorName(c)} accessibilityState={{ checked: hex.toUpperCase() === c.toUpperCase(), disabled: busy }} style={{ alignItems: 'center', gap: tokens.spacing.xs, minWidth: 64, minHeight: tokens.touchTarget }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c, borderWidth: 3, borderColor: hex.toUpperCase() === c.toUpperCase() ? tokens.text : tokens.line }} />
              <Text variant="caption" style={{ textTransform: 'capitalize' }}>{colorName(c)}</Text>
            </Pressable>
          ))}
        </View>
        {!wardrobe || wardrobe.customColor ? (
          <>
            <Text variant="caption" color="muted" style={{ marginBottom: 4 }}>
              Custom hex
            </Text>
            <TextInput
              value={customHex}
              editable={!busy}
              onChangeText={(t) => {
                setCustomHex(t);
                if (HEX_RE.test(t)) setHex(t);
              }}
              placeholder={COLORS.teal}
              placeholderTextColor={tokens.muted}
              style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget }}
              accessibilityLabel="Custom hex color"
            />
            {!HEX_RE.test(customHex) ? <Text variant="caption" style={{ color: tokens.danger }}>Use a six-digit color such as {COLORS.teal}, or choose a swatch.</Text> : null}
          </>
        ) : null}
      </Card>

      <Choices title="Sticker" options={stickers} selected={sticker} label={(s) => partLabel('sticker', s)} onPick={setSticker} disabled={busy} />
      {wardrobe ? (
        <>
          {/* Store parts (owner, Oct 28): kids see only what they own; adults see everything. */}
          <Choices title="Antenna" options={wardrobe.antennas} selected={antenna ?? 'classic'} label={(p) => partLabel('antenna', p)} onPick={setAntenna} disabled={busy} />
          <Choices title="Eyes" options={wardrobe.eyes} selected={eyes ?? 'classic'} label={(p) => partLabel('eyes', p)} onPick={setEyes} disabled={busy} />
          <Choices title="Eye color" options={wardrobe.eyeColors} selected={eyeColor ?? 'classic'} label={(p) => partLabel('eyeColor', p)} onPick={setEyeColor} disabled={busy} />
        </>
      ) : null}

      <Card style={{ marginBottom: tokens.spacing.lg }}>
        <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
          Personality
        </Text>
        <View style={{ gap: tokens.spacing.sm }}>
          {Object.entries(PERSONALITIES).map(([key, p]) => (
            <Pressable key={key} onPress={() => setPersonality(key as Personality)} disabled={busy} accessibilityRole="radio" accessibilityLabel={`${p.label}: ${p.sample}`} accessibilityState={{ checked: personality === key, disabled: busy }} style={{ padding: tokens.spacing.md, minHeight: tokens.touchTarget, gap: tokens.spacing.xs, borderRadius: tokens.radii.md, borderWidth: 1, borderColor: personality === key ? tokens.accent : tokens.line, backgroundColor: personality === key ? tokens.bg : 'transparent' }}>
              <Text variant="label" color={personality === key ? 'accent' : 'text'}>{p.label}</Text>
              <Text variant="caption" color="muted">{p.sample}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {error ? <Text style={{ color: tokens.danger }} accessibilityRole="alert">{error}</Text> : null}
      <Button label="Save" onPress={() => void save()} loading={busy} disabled={!HEX_RE.test(hex) || ((!wardrobe || wardrobe.customColor) && !HEX_RE.test(customHex))} />
    </>
  );
}

/** One row of choices (a card with a label and chips). */
function Choices<T extends string>({ title, options, selected, label, onPick, disabled }: { title: string; options: readonly T[]; selected: T; label: (o: T) => string; onPick: (o: T) => void; disabled?: boolean }) {
  const tokens = useTokens();
  return (
    <Card style={{ marginBottom: tokens.spacing.md }}>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
        {options.map((o) => (
          <Chip key={o} label={label(o)} selected={selected === o} onPress={disabled ? undefined : () => onPick(o)} />
        ))}
      </View>
    </Card>
  );
}

/** A swatch's name: the preset's key or the Store color's label, else the hex itself. */
function colorName(hex: string): string {
  const preset = Object.entries(COLORS).find(([, c]) => c.toUpperCase() === hex.toUpperCase());
  if (preset) return preset[0];
  const bought = Object.values(STORE_CATALOG).find((e) => (e as { hex?: string }).hex?.toUpperCase() === hex.toUpperCase());
  return bought?.label ?? hex;
}
