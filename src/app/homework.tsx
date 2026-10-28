// mega://homework — the parent's "Homework photo" sheet (board KidsSnap), opened from the chat's camera
// button. Adults only: a kid who lands here is sent back (the server refuses `homework.submit` anyway).
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useViewer } from '@/data/useViewer';
import { HomeworkSnap } from '@/features/kids/HomeworkSnap';
import { isAdultRole } from '@/features/shell/familyDirectory';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { useTokens } from '@/ui/theme';

export default function HomeworkRoute() {
  const viewer = useViewer();
  const tokens = useTokens();
  if (viewer === undefined) return <LoadingScreen />;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/chat'));
  if (!viewer || !isAdultRole(viewer.member.role)) return <Redirect href="/chat" />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
      <HomeworkSnap megaName={viewer.mega?.name ?? 'MEGA'} onDone={close} />
    </SafeAreaView>
  );
}
