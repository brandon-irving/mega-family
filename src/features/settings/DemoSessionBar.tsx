import { useRouter } from 'expo-router';
import { DEMO_PROFILE_COPY as C } from '@shared/config/demo';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useDemoProfile } from '@/data/useDemoProfile';
import { useViewer } from '@/data/useViewer';
import { clearQueryMemory } from '@/data/queryMemory';
import { errorCopyFor } from '@/data/errorCopy';
import { resetNavigationGuard } from '@/features/shell/navigation';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { ModalSheet } from '@/ui/ModalSheet';
import { useTokens } from '@/ui/theme';
import type { Id } from '@shared/domain/validators';

/** Demo-only controls follow the tester into the real recipient experience. */
export function DemoSessionBar({ resumeInvite = false }: { resumeInvite?: boolean }) {
  const { profile, switchTester } = useDemoProfile();
  if (!profile?.active) return null;
  return <ActiveDemoSessionBar profile={profile} switchTester={switchTester} resumeInvite={resumeInvite} />;
}

function ActiveDemoSessionBar({ profile, switchTester, resumeInvite }: {
  profile: NonNullable<ReturnType<typeof useDemoProfile>['profile']>;
  switchTester: ReturnType<typeof useDemoProfile>['switchTester'];
  resumeInvite: boolean;
}) {
  // The hook is bound to this mounted navigator, including its first render after a profile switch.
  const router = useRouter();
  const viewer = useViewer();
  const tokens = useTokens();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    if (resumeInvite && viewer === null && profile?.pendingToken) router.replace(`/join/${encodeURIComponent(profile.pendingToken)}` as never);
  }, [resumeInvite, viewer, profile.pendingToken, router]);
  const switchTo = async (memberId?: Id<'members'>) => {
    if (lock.current || viewer === undefined) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await switchTester({ memberId, expectedMemberId: viewer?.member._id ?? null });
      clearQueryMemory(); resetNavigationGuard(); setOpen(false);
      router.replace('/chat' as never);
    } catch (err) { setError(errorCopyFor(err)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={{ paddingHorizontal: tokens.spacing.md, backgroundColor: tokens.surface }}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text variant="caption" color="muted" numberOfLines={1} style={{ flex: 1 }}>Demo · {profile.currentName ?? 'Admin'}</Text><Button label={profile.testing ? C.backToAdmin : C.switchPerson} variant="ghost" disabled={busy} onPress={() => profile.testing ? void switchTo() : setOpen(true)} /></View>
    {error && <Text accessibilityRole="alert">{error}</Text>}
    {open && <ModalSheet open closeLabel="Close" title={C.switchTitle} onClose={() => { if (!busy) setOpen(false); }}>
      <Text color="muted">{C.switchHint}</Text>
      {profile.people?.map(person => <Button key={person.memberId} label={person.name} variant="secondary" disabled={busy || person.memberId === viewer?.member._id} onPress={() => void switchTo(person.memberId)} />)}
    </ModalSheet>}
  </View>;
}
