// Family tab (PLAN §4, adults and admins only): members list with each MEGA's badge, role and what
// it's doing, plus "Coming up" (events in the next 2 hours).
import { Pressable, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { API } from '@shared/domain/api';
import { Card } from '@/ui/Card';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { faceFor } from '@/features/shell/megaInfo';
import { AppSettingsButton } from '@/features/shell/AppSettingsButton';
import { Glyph, type GlyphName } from '@/features/integrations/glyphs';

export type MemberCard = Infer<(typeof API)['family']['members']['returns']>[number];
export type ComingUpEvent = Infer<(typeof API)['family']['comingUp']['returns']>[number];

const ROLE_LABEL = { admin: 'Admin', adult: 'Adult', kid: 'Kid' } as const;

export type FamilyContentProps = { members: MemberCard[]; comingUp: ComingUpEvent[]; onOpenMember: (memberId: string) => void; onOpenCalendar: () => void; onOpenPlaces?: () => void; onOpenLists?: () => void; nextEvent?: ComingUpEvent | null; onOpenIdeas?: () => void };

export function FamilyContent({ members, comingUp, onOpenMember, onOpenCalendar, onOpenPlaces, onOpenLists, nextEvent }: FamilyContentProps) {
  const tokens = useTokens();
  const shortcuts: { label: string; hint: string; icon: GlyphName; onPress?: () => void }[] = [
    { label: 'Lists', hint: 'Keep things together', icon: 'check', onPress: onOpenLists },
    { label: 'Places', hint: 'Your familiar places', icon: 'pin', onPress: onOpenPlaces },
  ];
  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.spacing.md }}>
        <Text variant="headline">Family</Text>
        <AppSettingsButton />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg }}>
        {shortcuts.filter((shortcut) => shortcut.onPress).map((shortcut) => (
          <Pressable key={shortcut.label} onPress={shortcut.onPress} accessibilityRole="button" accessibilityLabel={`Open family ${shortcut.label.toLowerCase()}`} style={{ flexBasis: '47%', flexGrow: 1 }}>
            <Card style={{ gap: tokens.spacing.xs, minHeight: 104 }}>
              <Glyph name={shortcut.icon} color={tokens.accent} size={22} />
              <Text variant="label">{shortcut.label}</Text>
              <Text variant="caption" color="muted">{shortcut.hint}</Text>
            </Card>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={onOpenCalendar} accessibilityRole="button" accessibilityLabel="Open family calendar" style={{ marginBottom: tokens.spacing.lg }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
          <Glyph name="calendar" color={tokens.accent} size={24} />
          <View style={{ flex: 1, gap: tokens.spacing.xs }}><Text variant="label">Calendar</Text><Text numberOfLines={2} color="muted">{nextEvent ? nextEvent.title : 'No upcoming events'}</Text>{nextEvent ? <Text variant="caption" color="muted">{new Date(nextEvent.start).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text> : null}</View>
          <Glyph name="chevron" color={tokens.muted} />
        </Card>
      </Pressable>
      <Text variant="label" color="muted" style={{ marginBottom: tokens.spacing.sm }}>YOUR PEOPLE</Text>
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
            <Pressable key={e._id} onPress={onOpenCalendar} accessibilityRole="button" accessibilityLabel={`Open calendar: ${e.title}`}><Card>
              <Text variant="label">{e.title}</Text>
              <Text color="muted">{new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
            </Card></Pressable>
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
