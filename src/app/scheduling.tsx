import { useMutation } from 'convex/react';
import { ageGroupOf, canConnectAccounts } from '@shared/ageGroups';
import { router } from '@/features/shell/navigation';
import { SchedulingSettings } from '@/features/scheduling/SchedulingSettings';
import { useViewer } from '@/data/useViewer';
import { api } from '@/data/api';
import { useRunAction } from '@/features/shell/useRunAction';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { SCHEDULING_COPY } from '@shared/config/scheduling';

export default function SchedulingRoute() {
  const viewer = useViewer();
  const request = useMutation(api.family.requestConnections);
  const { busy, error, run } = useRunAction();
  const member = viewer?.member;
  const today = new Date().toISOString().slice(0,10);
  const allowed = member && canConnectAccounts(member, today);
  const teen = member && ageGroupOf(member, today) === 'teen';
  const pending = member?.connectionRequest?.status === 'pending';
  return <Sheet title={SCHEDULING_COPY.title} onClose={() => router.back()}>
    {!viewer ? <Text>Loading…</Text> : allowed ? <SchedulingSettings /> : <>
      <Text variant="title">{teen ? 'Ask your parent first' : 'Account connections need an age check'}</Text>
      <Text color="muted">{teen ? 'Your MEGA can ask your parent to allow connections. You will still choose what Google can share, and your inbox stays private.' : 'Children under 13 cannot connect accounts. If your age group is incorrect, ask your parent to update it in Family.'}</Text>
      {teen ? <Button label={pending ? 'Waiting for your parent' : 'Ask my parent'} disabled={pending || !!busy} loading={!!busy} onPress={() => void run('request', () => request({}))} /> : null}
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    </>}
  </Sheet>;
}
