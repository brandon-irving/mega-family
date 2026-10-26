// mega://today — Today sheet (PLAN §1 / §Today).
import { router } from 'expo-router';
import { useAnswerNotification, useRespondToRequest, useToday } from '@/data/useToday';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Sheet } from '@/ui/Sheet';
import { TodayContent } from '@/features/today/TodayContent';

export default function TodayRoute() {
  const today = useToday();
  const respondToRequest = useRespondToRequest();
  const answerNotification = useAnswerNotification();

  if (today === undefined) return <LoadingScreen label="Loading today…" />;

  return (
    <Sheet title="Today" onClose={() => router.back()}>
      <TodayContent
        today={today}
        onRespondRequest={(requestId, accept) => respondToRequest({ requestId: requestId as never, accept })}
        onAnswerNotification={(notificationId, buttonId) => answerNotification({ notificationId: notificationId as never, buttonId, via: 'block' })}
      />
    </Sheet>
  );
}
