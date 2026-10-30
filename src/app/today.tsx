// mega://today — Today sheet (PLAN §1 / §Today).
import { router } from '@/features/shell/navigation';
import { useAnswerNotification, useRespondToRequest, useToday } from '@/data/useToday';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { TodayContent } from '@/features/today/TodayContent';
import { useViewer } from '@/data/useViewer';

export default function TodayRoute() {
  const today = useToday();
  const respondToRequest = useRespondToRequest();
  const answerNotification = useAnswerNotification();
  const viewer = useViewer();
  const adult = viewer?.member.role === 'adult' || viewer?.member.role === 'admin';

  if (today === undefined) return <LoadingScreen label="Loading today…" />;

  return (
    <Sheet title="Today" onClose={() => router.back()}>
      <TodayContent
        today={today}
        timezone={viewer?.family.timezone}
        onOpenCalendar={adult ? () => router.push('/family/calendar' as never) : undefined}
        onOpenLists={adult ? () => router.push('/family/lists' as never) : undefined}
        onRespondRequest={(requestId, accept) => respondToRequest({ requestId: requestId as never, accept })}
        onAnswerNotification={(notificationId, buttonId) => answerNotification({ notificationId: notificationId as never, buttonId, via: 'block' })}
      />
    </Sheet>
  );
}
