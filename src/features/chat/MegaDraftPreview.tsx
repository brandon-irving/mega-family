import { MEGA_CREATION } from '@shared/config/megaCreation';
import { AGE_GROUP_LABELS } from '@shared/ageGroups';
import { View } from 'react-native';
import type { MegaDraftData } from '@shared/domain/megaCreation';
import { ASSISTANT_BRIEF } from '@shared/config/assistantBrief';
import { PERSONALITIES } from '@shared/config/looks';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export function MegaDraftPreview({ data }: { data: MegaDraftData }) {
  const tokens = useTokens();
  return <View style={{ gap: tokens.spacing.sm }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
      <MegaSprite hex={data.hex} sticker={data.sticker} face={PERSONALITIES[data.personality].face} scale={2} />
      <View style={{ flex: 1 }}><Text variant="label">{data.megaName}</Text><Text color="muted">{data.target === 'self' ? 'Your personal MEGA' : `For ${data.name ?? 'your family member'}`}</Text><Text variant="caption" color="muted">{PERSONALITIES[data.personality].label} · {data.sticker === 'none' ? 'No sticker' : data.sticker}</Text></View>
    </View>
    {data.ageGroup ? <Text color="muted">{AGE_GROUP_LABELS[data.ageGroup]}</Text> : null}
    {data.accountConnections ? <Text color="muted">{MEGA_CREATION.connectionPermissions[data.accountConnections]}</Text> : null}
    {data.brief ? ASSISTANT_BRIEF.fields.filter(field => data.brief?.[field.id]).map(field => <View key={field.id}><Text variant="caption" color="muted">{field.summaryLabel}</Text><Text>{data.brief?.[field.id]}</Text></View>) : <Text color="muted">No first-day brief. You can work that out together later.</Text>}
  </View>;
}
