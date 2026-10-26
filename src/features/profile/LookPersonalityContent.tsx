// Look & personality screen (PLAN §3): 6 color presets + custom hex, 4 stickers + none, 4
// personalities each with a sample line, via megas.update. The MEGA blinks here (no floating anim).
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { COLORS, HEX_RE, PERSONALITIES } from '@shared/config/looks';
import { STICKERS } from '@shared/config/ids';
import type { Personality } from '@shared/domain/enums';
import type { StickerId } from '@shared/config/looks';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export type LookPersonalityValue = { hex: string; sticker: StickerId; personality: Personality };

export type LookPersonalityContentProps = { value: LookPersonalityValue; onSave: (value: LookPersonalityValue) => void };

export function LookPersonalityContent({ value, onSave }: LookPersonalityContentProps) {
  const tokens = useTokens();
  const [hex, setHex] = useState(value.hex);
  const [customHex, setCustomHex] = useState(value.hex);
  const [sticker, setSticker] = useState<StickerId>(value.sticker);
  const [personality, setPersonality] = useState<Personality>(value.personality);
  const blink = personality ? PERSONALITIES[personality].face : 'open';

  return (
    <>
      <View style={{ alignItems: 'center', marginBottom: tokens.spacing.lg }}>
        <MegaSprite hex={hex} sticker={sticker} face={blink} scale={5} />
      </View>

      <Card style={{ marginBottom: tokens.spacing.md }}>
        <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
          Color
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, marginBottom: tokens.spacing.sm }}>
          {Object.entries(COLORS).map(([key, c]) => (
            <Chip key={key} label={key} selected={hex === c} onPress={() => setHex(c)} />
          ))}
        </View>
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
      </Card>

      <Card style={{ marginBottom: tokens.spacing.md }}>
        <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
          Sticker
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
          {STICKERS.map((s) => (
            <Chip key={s} label={s} selected={sticker === s} onPress={() => setSticker(s)} />
          ))}
        </View>
      </Card>

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

      <Button label="Save" onPress={() => onSave({ hex, sticker, personality })} disabled={!HEX_RE.test(hex)} />
    </>
  );
}
