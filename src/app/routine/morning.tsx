// mega://routine/morning — the kid's morning routine, full screen (board KidsMorning), opened from the
// routine card in their thread.
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { KIDS_COPY } from '@shared/config/copy';
import { useCheckRoutineStep, useRoutineToday } from '@/data/useKids';
import { useViewer } from '@/data/useViewer';
import { MorningRoutineView } from '@/features/kids/MorningRoutine';
import { useOptimisticSteps } from '@/features/kids/RoutineCard';
import { useDismiss } from '@/ui/dismiss';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export default function MorningRoute() {
  const viewer = useViewer();
  const tokens = useTokens();
  const run = useRoutineToday('morning');
  const check = useCheckRoutineStep();
  const { steps, setStep } = useOptimisticSteps(run.status === 'ok' ? run.data : null);
  // Read the clock once on mount (a lazy initializer), not on every render.
  const [dateLine] = useState(() => new Date().toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' }));
  const close = () => (router.canGoBack() ? router.back() : router.replace('/chat'));
  // Escape on web closes it too (owner, Oct 28: every modal can be closed; the navigator handles Android back).
  useDismiss(close, { androidBack: false });
  if (viewer === undefined || run.status === 'loading') return <LoadingScreen />;
  const toggle = (id: string, done: boolean) => {
    setStep(id, done);
    if (run.status === 'ok' && run.data) void check({ runId: run.data._id, stepId: id, done }).catch(() => setStep(id, !done));
  };
  return (
    <Screen padded={false}>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" style={{ alignSelf: 'flex-end', width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center', marginRight: tokens.spacing.sm }}>
        <Text variant="title">✕</Text>
      </Pressable>
      {run.status === 'ok' && run.data && viewer?.mega ? (
        <MorningRoutineView
          kidName={viewer.member.name}
          mega={{ hex: viewer.mega.look.hex, sticker: viewer.mega.look.sticker, parts: viewer.mega.look }}
          steps={steps}
          dateLine={dateLine}
          onDone={(id) => toggle(id, true)}
          onStartOver={() => steps.forEach((s) => toggle(s.id, false))}
        />
      ) : (
        <View style={{ padding: tokens.spacing.lg }}>
          <Text color="muted">{KIDS_COPY.notReady}</Text>
        </View>
      )}
    </Screen>
  );
}
