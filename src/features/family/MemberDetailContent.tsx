import { PersonAvatar } from '@/ui/PersonAvatar';
import { ageGroupOf, AGE_GROUP_LABELS } from '@shared/ageGroups';
import { AgeGroupControls } from './AgeGroupControls';
// Member detail sheet (PLAN §4): Message / Visit room / Kid controls (parents only) / read kid chat
// (read-only). Kid controls: homework mode, quiet hours, daily minutes, blocked topics, what the
// kid's MEGA tells parents, and "Parents can read chats" (on by default).
import { Switch, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { API } from '@shared/domain/api';
import { G4_COPY, G5_UI_COPY } from '@shared/config/copy';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { faceFor } from '@/features/shell/megaInfo';

export type MemberDetail = Infer<(typeof API)['family']['member']['returns']>;
export type KidControlsPatch = Partial<{
  homeworkMode: boolean;
  dailyMinutes: number;
  parentsCanReadChat: boolean;
  webSearch: boolean;
}>;

export type MemberDetailContentProps = {
  detail: MemberDetail;
  onMessage: () => void;
  onVisitRoom: () => void;
  onChangeKidControls: (patch: KidControlsPatch) => void;
  /** G4 (board SearchLog): a parent opens this kid's blocked/changed searches. */
  onOpenSearches?: () => void;
  /** G5 (board ProfileRules): a parent opens this kid's Rules and limits page. */
  onOpenRules?: () => void;
};

export function MemberDetailContent({ detail, onMessage, onVisitRoom, onChangeKidControls, onOpenSearches, onOpenRules }: MemberDetailContentProps) {
  const tokens = useTokens();
  const { member, mega, kidControls, canReadChat } = detail;
  const isKid = member.role === 'kid';

  return (
    <>
      <View style={{ alignItems: 'center', gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg }}>
        {mega ? <MegaBadge hex={mega.look.hex} sticker={mega.look.sticker} face={faceFor(mega.personality)} size={64} /> : <PersonAvatar size={64} />}
        <Text variant="title">{member.name}</Text><Text color="muted">{AGE_GROUP_LABELS[ageGroupOf(member, new Date().toISOString().slice(0,10))]}</Text>
        {detail.relationshipToViewer && (
          <Text color="muted" style={{ textTransform: 'capitalize' }}>
            Your {detail.relationshipToViewer}
          </Text>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg }}>
        {mega && <Button label="Message" onPress={onMessage} style={{ flex: 1 }} />}
        <Button label="Visit room" variant="secondary" onPress={onVisitRoom} style={{ flex: 1 }} />
      </View>

      {isKid && kidControls ? <AgeGroupControls member={member} /> : null}
      {isKid && kidControls && (
        <Card style={{ marginBottom: tokens.spacing.lg }}>
          <Text variant="label" style={{ marginBottom: tokens.spacing.md }}>
            Family protections
          </Text>
          <Row label="Homework mode" value={kidControls.homeworkMode} onChange={(v) => onChangeKidControls({ homeworkMode: v })} />
          <Row label="Web search" value={kidControls.webSearch} onChange={(v) => onChangeKidControls({ webSearch: v })} />
          <Row label="Parents can read chats" value={kidControls.parentsCanReadChat} onChange={(v) => onChangeKidControls({ parentsCanReadChat: v })} />
          <Text variant="caption" color="muted" style={{ marginTop: tokens.spacing.sm }}>
            Quiet hours {kidControls.quietHours.start}–{kidControls.quietHours.end} · {kidControls.dailyMinutes ?? 0} min/day
          </Text>
          {onOpenRules ? <Button label={G5_UI_COPY.rulesRow} variant="secondary" onPress={onOpenRules} style={{ marginTop: tokens.spacing.md }} /> : null}
          {onOpenSearches ? <Button label={G4_COPY.searchesButton} variant="secondary" onPress={onOpenSearches} style={{ marginTop: tokens.spacing.md }} /> : null}
        </Card>
      )}

      {isKid && !kidControls && canReadChat && (
        <Text color="muted" style={{ marginBottom: tokens.spacing.lg }}>
          Only this kid&rsquo;s parents can change their controls.
        </Text>
      )}
    </>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const tokens = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: tokens.spacing.xs }}>
      <Text>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: tokens.accent }} accessibilityLabel={label} />
    </View>
  );
}
