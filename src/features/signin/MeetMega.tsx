import { View } from 'react-native';
import { CHARACTER_EDITOR } from '@shared/config/characterEditor';
import type { StickerId } from '@shared/config/looks';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

const C = CHARACTER_EDITOR.introduction;
/** Static confirmation portrait; the first chat owns the entrance animation. */
export function MeetMega({ mega, inviter, child = false }: { mega: { name: string; look: { hex: string; sticker: StickerId } }; inviter: string; child?: boolean }) {
  const tokens = useTokens();
  return <View style={{ alignSelf: 'stretch', gap: tokens.spacing.md }}>
    <View style={{ height: 110, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <MegaSprite hex={mega.look.hex} sticker={mega.look.sticker} view="front" frame="stand" face="happy" scale={2} accessibilityLabel={mega.name} />
    </View>
    <View style={{ backgroundColor: tokens.bg, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.lg, padding: tokens.spacing.md, gap: tokens.spacing.sm }}>
      <Text weight="700">{C.greeting(mega.name)}</Text>
      <Text color="muted">{child ? C.child : C.invitation(inviter)}</Text>
    </View>
  </View>;
}
