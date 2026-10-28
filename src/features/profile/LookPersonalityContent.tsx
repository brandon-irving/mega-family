// Look & personality screen (PLAN §3): 6 color presets + custom hex, 4 stickers + none, 4
// personalities each with a sample line, via megas.update. The MEGA blinks here (no floating anim).
import { useState } from 'react';
import { TextInput, View } from 'react-native';
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

export type LookPersonalityValue = { hex: string; sticker: StickerId; personality: Personality; antenna?: AntennaId; eyes?: EyeStyleId; eyeColor?: EyeColorId };

/** `wardrobe` (src/features/profile/wardrobe.ts): what this person may pick, including Store parts. Without it
 * (the join flow's "Change my MEGA") only the preset colors, any hex, the stickers and personality show. */
export type LookPersonalityContentProps = { value: LookPersonalityValue; wardrobe?: Wardrobe; onSave: (value: LookPersonalityValue) => void };

export function LookPersonalityContent({ value, wardrobe, onSave }: LookPersonalityContentProps) {
  const tokens = useTokens();
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

  return (
    <>
      <View style={{ alignItems: 'center', marginBottom: tokens.spacing.lg }}>
        <MegaSprite hex={hex} sticker={sticker} parts={{ antenna, eyes, eyeColor }} face={blink} scale={5} />
      </View>

      <Card style={{ marginBottom: tokens.spacing.md }}>
        <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
          Color
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, marginBottom: tokens.spacing.sm }}>
          {colors.map((c) => (
            <Chip key={c} label={colorName(c)} selected={hex.toUpperCase() === c.toUpperCase()} onPress={() => setHex(c)} />
          ))}
        </View>
        {!wardrobe || wardrobe.customColor ? (
          <>
            <Text variant="caption" color="muted" style={{ marginBottom: 4 }}>
              Custom hex
            </Text>
            <TextInput
              value={customHex}
              onChangeText={(t) => {
                setCustomHex(t);
                if (HEX_RE.test(t)) setHex(t);
              }}
              placeholder={COLORS.teal}
              placeholderTextColor={tokens.muted}
              style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget }}
              accessibilityLabel="Custom hex color"
            />
          </>
        ) : null}
      </Card>

      <Choices title="Sticker" options={stickers} selected={sticker} label={(s) => partLabel('sticker', s)} onPick={setSticker} />
      {wardrobe ? (
        <>
          {/* Store parts (owner, Oct 28): kids see only what they own; adults see everything. */}
          <Choices title="Antenna" options={wardrobe.antennas} selected={antenna ?? 'classic'} label={(p) => partLabel('antenna', p)} onPick={setAntenna} />
          <Choices title="Eyes" options={wardrobe.eyes} selected={eyes ?? 'classic'} label={(p) => partLabel('eyes', p)} onPick={setEyes} />
          <Choices title="Eye color" options={wardrobe.eyeColors} selected={eyeColor ?? 'classic'} label={(p) => partLabel('eyeColor', p)} onPick={setEyeColor} />
        </>
      ) : null}

      <Card style={{ marginBottom: tokens.spacing.lg }}>
        <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
          Personality
        </Text>
        <View style={{ gap: tokens.spacing.sm }}>
          {Object.entries(PERSONALITIES).map(([key, p]) => (
            <Chip key={key} label={`${p.label} — ${p.sample}`} selected={personality === key} onPress={() => setPersonality(key as Personality)} />
          ))}
        </View>
      </Card>

      <Button label="Save" onPress={() => onSave(wardrobe ? { hex, sticker, personality, antenna, eyes, eyeColor } : { hex, sticker, personality })} disabled={!HEX_RE.test(hex)} />
    </>
  );
}

/** One row of choices (a card with a label and chips). */
function Choices<T extends string>({ title, options, selected, label, onPick }: { title: string; options: readonly T[]; selected: T; label: (o: T) => string; onPick: (o: T) => void }) {
  const tokens = useTokens();
  return (
    <Card style={{ marginBottom: tokens.spacing.md }}>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
        {options.map((o) => (
          <Chip key={o} label={label(o)} selected={selected === o} onPress={() => onPick(o)} />
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
