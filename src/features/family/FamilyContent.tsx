// Family tab (PLAN §4, adults and admins only): members list with each MEGA's badge, role and what
// it's doing, plus "Coming up" (events in the next 2 hours).
import { Pressable, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { API } from '@shared/domain/api';
import { G4_COPY } from '@shared/config/copy';
import { Card } from '@/ui/Card';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { faceFor } from '@/features/shell/megaInfo';

export type MemberCard = Infer<(typeof API)['family']['members']['returns']>[number];
export type ComingUpEvent = Infer<(typeof API)['family']['comingUp']['returns']>[number];

const ROLE_LABEL = { admin: 'Admin', adult: 'Adult', kid: 'Kid' } as const;

export type FamilyContentProps = { members: MemberCard[]; comingUp: ComingUpEvent[]; onOpenMember: (memberId: string) => void; onOpenCalendar: () => void; onOpenPlaces?: () => void };

export function FamilyContent({ members, comingUp, onOpenMember, onOpenCalendar, onOpenPlaces }: FamilyContentProps) {
  const tokens = useTokens();
  const link = { minHeight: tokens.touchTarget, justifyContent: 'center' as const };
  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.spacing.md }}>
        <Text variant="headline">Family</Text>
        <View style={{ flexDirection: 'row', gap: tokens.spacing.lg }}>
          {onOpenPlaces ? (
            <Pressable onPress={onOpenPlaces} accessibilityRole="button" accessibilityLabel="Open family places" style={link}>
              <Text color="accent">{G4_COPY.placesTitle}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onOpenCalendar} accessibilityRole="button" accessibilityLabel="Open family calendar" style={link}>
            <Text color="accent">Calendar</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg }}>
        {members.map((m) => (
          <Pressable key={m.member._id} onPress={() => onOpenMember(m.member._id)} accessibilityRole="button" accessibilityLabel={`${m.member.name}, ${ROLE_LABEL[m.member.role]}`}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
              {m.mega ? (
                <MegaBadge hex={m.mega.look.hex} sticker={m.mega.look.sticker} face={faceFor(m.mega.personality)} />
              ) : (
                <View style={{ width: 44, height: 44, borderRadius: 11, backgroundColor: tokens.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Text color="muted">—</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text variant="label">{m.member.name}</Text>
                <Text variant="caption" color="muted">
                  {ROLE_LABEL[m.member.role]} · {m.mega ? statusText(m.status) : 'No MEGA yet'}
                </Text>
              </View>
            </Card>
          </Pressable>
        ))}
      </View>

      <Text variant="label" color="muted" style={{ marginBottom: tokens.spacing.sm }}>
        COMING UP
      </Text>
      {comingUp.length === 0 ? (
        <Text color="muted">No events in the next 2 hours.</Text>
      ) : (
        <View style={{ gap: tokens.spacing.sm }}>
          {comingUp.map((e) => (
            <Card key={e._id}>
              <Text variant="label">{e.title}</Text>
              <Text color="muted">{new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
            </Card>
          ))}
        </View>
      )}
    </>
  );
}

function statusText(status: MemberCard['status']): string {
  if (!status) return 'Idle';
  return status.busy ? status.label : 'Available';
}
