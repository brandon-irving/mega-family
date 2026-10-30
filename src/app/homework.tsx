// mega://homework — the parent's "Homework photo" sheet (board KidsSnap), opened from the chat's camera
// button. Adults only: a kid who lands here is sent back (the server refuses `homework.submit` anyway).
import { Redirect } from 'expo-router';
import { router } from '@/features/shell/navigation';
import { useViewer } from '@/data/useViewer';
import { HomeworkSnap } from '@/features/kids/HomeworkSnap';
import { isAdultRole } from '@/features/shell/familyDirectory';
import { useDismiss } from '@/ui/dismiss';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Screen } from '@/ui/Screen';

export default function HomeworkRoute() {
  const viewer = useViewer();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/chat'));
  // Escape on web closes it too (owner, Oct 28: every modal can be closed; the navigator handles Android back).
  useDismiss(close, { androidBack: false });
  if (viewer === undefined) return <LoadingScreen />;
  if (!viewer || !isAdultRole(viewer.member.role)) return <Redirect href="/chat" />;
  return (
    // fullBleed: the live camera (HomeworkSnap) fills the frame edge to edge; the default content-width
    // cap (src/ui/Screen.tsx) squeezed it to 720px on wide desktop web (G6 review fix).
    <Screen padded={false} fullBleed>
      <HomeworkSnap megaName={viewer.mega?.name ?? 'MEGA'} onDone={close} />
    </Screen>
  );
}
