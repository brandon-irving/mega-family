import { SCHEDULING } from '@shared/config/scheduling';
import { View } from 'react-native';
import { useMailPlans } from '@/data/useScheduling';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { MailPlanCard } from './MailPlanCard';
export function SchedulingInbox() {
  const state = useMailPlans();
  const t = useTokens();
  if (state.status !== 'ok' || !state.data.length) return null;
  return <View style={{ gap: t.spacing.md }}><Text variant="label">Plans from email</Text>{state.data.slice(0, SCHEDULING.inboxLimit).map(p => <MailPlanCard key={p.id} planId={p.id} />)}{state.data.length > SCHEDULING.inboxLimit ? <Text color="muted">More plans are in your chat.</Text> : null}</View>;
}
