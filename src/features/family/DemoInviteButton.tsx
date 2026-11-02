import { DEMO_PROFILE_COPY as C } from '@shared/config/demo';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useDemoProfile } from '@/data/useDemoProfile';
import { useViewer } from '@/data/useViewer';
import { clearQueryMemory } from '@/data/queryMemory';
import { errorCopyFor } from '@/data/errorCopy';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';

export function DemoInviteButton({ url }: { url: string }) {
  const { profile, testInvite } = useDemoProfile();
  const viewer = useViewer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  if (!profile?.active || profile.testing || viewer?.member.role !== 'admin') return null;
  const test = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      clearQueryMemory();
      await testInvite({ token: url, expectedMemberId: viewer.member._id });
      // AuthGate opens Start; its demo bar resumes the actual join route after the new stack mounts.
    } catch (err) { setError(errorCopyFor(err)); }
    finally { locked.current = false; setBusy(false); }
  };
  return <View><Button label={C.testInvite} variant="secondary" loading={busy} onPress={() => void test()} />{error && <Text accessibilityRole="alert">{error}</Text>}</View>;
}
