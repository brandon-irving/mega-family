// `mega://` picks its landing route from the same gate as the root layout (PLAN §Screen order: Chat is
// the home screen once there's a family to chat for). By the time this mounts, `_layout.tsx` has already
// settled auth and the viewer — see its comment — so there's no loading branch to handle here.
import { Redirect } from 'expo-router';
import { useViewer } from '@/data/useViewer';
import { useAuthState } from '@/services/auth';

export default function Index() {
  const authState = useAuthState();
  const viewer = useViewer();

  if (authState.status !== 'signedIn') return <Redirect href="/welcome" />;
  if (viewer == null) return <Redirect href="/start" />;
  return <Redirect href="/chat" />;
}
