import { useState } from 'react';
import { AGE_GROUPS, AGE_GROUP_LABELS, ageGroupAt } from '@shared/ageGroups';
import { useAgeGroupActions } from '@/data/useAgeGroups';
import { errorCopyFor } from '@/data/errorCopy';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import type { MemberDetail } from './MemberDetailContent';
export function AgeGroupControls({ member, timezone }: { member: MemberDetail['member']; timezone: string }) {
  const actions = useAgeGroupActions(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const group = ageGroupAt(member, new Date().getTime(), timezone);
  const run = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(''); try { await fn(); } catch(e) { setError(errorCopyFor(e)); } finally { setBusy(false); } };
  return <Card><Text variant="label">Age group · {AGE_GROUP_LABELS[group]}</Text>
    <Text color="muted">Age group is separate from family permissions. A teen’s private accounts are not shared with parents.</Text>
    {!member.birthday ? AGE_GROUPS.map(g => <Button key={g} label={AGE_GROUP_LABELS[g]} variant="secondary" disabled={busy || group === g} onPress={() => void run(() => actions.setAgeGroup({ memberId: member._id, ageGroup: g }))} />) : null}
    {group === 'teen' ? <><Text color="muted">Google may require its own approval for a supervised account. Your approval lets this teen connect their own accounts; it does not give you inbox access.</Text><Button label={member.connectionsApprovedBy ? 'Revoke account connections' : 'Approve teen account connections'} disabled={busy} onPress={() => void run(() => actions.approveConnections({ memberId: member._id, approved: !member.connectionsApprovedBy }))} /></> : null}
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
  </Card>;
}
