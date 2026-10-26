// MEGA profile sheet (PLAN §3): sprite, name + rename (adults), status, a Look & personality button,
// What it shares (adults), and (admin) What it remembers.
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { megaDoc } from '@shared/domain/api';
import type { ShareLevel } from '@shared/domain/enums';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { faceFor } from '@/features/shell/megaInfo';

export type MegaDoc = Infer<typeof megaDoc>;
export type Sharing = { schedule: ShareLevel; lists: ShareLevel; hqActivity: ShareLevel };

export type ProfileContentProps = {
  mega: MegaDoc;
  statusLine: string;
  canRename: boolean;
  canSeeSharing: boolean;
  isAdmin: boolean;
  sharing?: Sharing;
  onRename: (name: string) => void;
  onOpenLookPersonality: () => void;
  onChangeSharing?: (patch: Partial<Sharing>) => void;
  onOpenMemories?: () => void;
};

const SHARE_LEVELS: ShareLevel[] = ['me', 'partner', 'family'];
const SHARE_LABEL: Record<ShareLevel, string> = { me: 'Only me', partner: 'Partner', family: 'Family' };

export function ProfileContent({ mega, statusLine, canRename, canSeeSharing, isAdmin, sharing, onRename, onOpenLookPersonality, onChangeSharing, onOpenMemories }: ProfileContentProps) {
  const tokens = useTokens();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(mega.name);

  return (
    <>
      <View style={{ alignItems: 'center', gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg }}>
        <MegaSprite hex={mega.look.hex} sticker={mega.look.sticker} face={faceFor(mega.personality)} scale={5} />
        {editing ? (
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => {
              onRename(name);
              setEditing(false);
            }}
            autoFocus
            style={{ color: tokens.text, fontSize: tokens.type.title.fontSize, fontWeight: '700', borderBottomWidth: 1, borderColor: tokens.line, minWidth: 160, textAlign: 'center' }}
            accessibilityLabel="MEGA name"
          />
        ) : (
          <Pressable onPress={() => canRename && setEditing(true)} accessibilityRole={canRename ? 'button' : undefined} accessibilityLabel={canRename ? `Rename ${mega.name}` : mega.name}>
            <Text variant="title">{mega.name}{canRename ? ' ✎' : ''}</Text>
          </Pressable>
        )}
        <Text color="muted">{statusLine}</Text>
      </View>

      <Pressable onPress={onOpenLookPersonality} accessibilityRole="button" accessibilityLabel="Look and personality">
        <Card style={{ marginBottom: tokens.spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="label">Look &amp; personality</Text>
          <Text color="muted">›</Text>
        </Card>
      </Pressable>

      {canSeeSharing && sharing && (
        <Card style={{ marginBottom: tokens.spacing.lg }}>
          <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
            What it shares
          </Text>
          {(['schedule', 'lists', 'hqActivity'] as const).map((key) => (
            <View key={key} style={{ marginBottom: tokens.spacing.sm }}>
              <Text variant="caption" color="muted" style={{ marginBottom: 4, textTransform: 'capitalize' }}>
                {key === 'hqActivity' ? 'HQ activity' : key}
              </Text>
              <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
                {SHARE_LEVELS.map((level) => (
                  <Chip key={level} label={SHARE_LABEL[level]} selected={sharing[key] === level} onPress={() => onChangeSharing?.({ [key]: level })} />
                ))}
              </View>
            </View>
          ))}
        </Card>
      )}

      {isAdmin && (
        <Pressable onPress={onOpenMemories} accessibilityRole="button" accessibilityLabel="What it remembers">
          <Card>
            <Text variant="label">What it remembers</Text>
          </Card>
        </Pressable>
      )}
    </>
  );
}
