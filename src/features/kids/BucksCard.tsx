// Board KidsBucks: "Admin released 5 Mega Bucks!" — the pixel coin pops in with a few twinkles, the new
// balance, and Open the Store / Later. From a `{ kind: 'bucks', ledgerId }` card in the kid's thread.
//
// The board draws this as an overlay over the thread; here it is the card itself (in place, so it stays in
// the thread's history and never covers a message the kid is reading). "Later" folds it to one line.
//
// CONTRACT NOTE (for the backend): there is no read-by-ledgerId query, so the card finds its row in the
// first page of the kid's own `bucks.history`. A `bucks.entry({ ledgerId })` query would cover older rows.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import type { Id } from '@shared/domain/validators';
import { fillCopy, KIDS_COPY } from '@shared/config/copy';
import { useBucksBalance, useBucksHistory } from '@/data/useKids';
import { useFamilyDirectory } from '@/features/shell/familyDirectory';
import { BucksCoin } from '@/ui/BucksCoin';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { BucksPill, CardActions, ThreadCard } from '@/ui/ThreadCard';
import { CardFallback } from './CardFallback';

export type BucksSourceKind = 'practice' | 'chore' | 'bonus' | 'purchase';

const SPARKLES: [number, number, number][] = [
  [6, 18, 0],
  [112, 8, 300],
  [120, 96, 600],
  [0, 100, 900],
  [60, 0, 450],
];

function Sparkle({ left, top, delay, reduced }: { left: number; top: number; delay: number; reduced: boolean }) {
  const tokens = useTokens();
  const o = useSharedValue(reduced ? 0.8 : 0);
  useEffect(() => {
    if (reduced) return;
    o.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: tokens.durations.slow * 1.75 }), withTiming(0, { duration: tokens.durations.slow * 1.75 })), -1));
  }, [o, delay, reduced, tokens.durations.slow]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ position: 'absolute', left, top, width: 8, height: 8, backgroundColor: tokens.bucks }, style]} />;
}

export function BucksMomentView({ by, amount, sourceKind, balance, onOpenStore }: { by: string; amount: number; sourceKind: BucksSourceKind; balance: number | null; onOpenStore: () => void }) {
  const tokens = useTokens();
  const reduced = useReducedMotion();
  const [folded, setFolded] = useState(false);
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!reduced) scale.value = withSequence(withTiming(1.12, { duration: tokens.durations.slow }), withSpring(1));
  }, [scale, reduced, tokens.durations.slow]);
  const coinStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const title = fillCopy(KIDS_COPY.bucksTitle, { by, n: amount });
  if (folded) return <ThreadCard from={KIDS_COPY.stepperLabel} title={title} />;
  const forLine = sourceKind === 'practice' ? KIDS_COPY.bucksForPractice : sourceKind === 'chore' ? KIDS_COPY.bucksForChore : KIDS_COPY.bucksForBonus;
  return (
    <Animated.View entering={reduced ? undefined : ZoomIn.duration(tokens.durations.slow)}>
      <View accessibilityRole="summary" accessibilityLabel={`${title} ${forLine}`} style={{ backgroundColor: tokens.surface, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, alignItems: 'center', gap: 10 }}>
        <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
          {SPARKLES.map(([l, t, d]) => (
            <Sparkle key={`${l}-${t}`} left={l} top={t} delay={d} reduced={!!reduced} />
          ))}
          <Animated.View style={coinStyle}>
            <BucksCoin size={96} />
          </Animated.View>
        </View>
        <Text variant="display" style={{ color: tokens.bucks }}>
          +{amount}
        </Text>
        <Text variant="headline" style={{ textAlign: 'center' }}>
          {title}
        </Text>
        <Text color="muted" style={{ textAlign: 'center' }}>
          {forLine}
        </Text>
        {balance !== null && <BucksPill label={fillCopy(KIDS_COPY.bucksYouHave, { n: balance })} />}
        <View style={{ alignSelf: 'stretch', marginTop: tokens.spacing.sm }}>
          <CardActions
            cols={1}
            actions={[
              { id: 'store', label: KIDS_COPY.openStore, onPress: onOpenStore },
              { id: 'later', label: KIDS_COPY.later, onPress: () => setFolded(true), variant: 'ghost' },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

export function BucksCard({ ledgerId, megaName }: { ledgerId: Id<'bucksLedger'>; megaName: string }) {
  const history = useBucksHistory();
  const balance = useBucksBalance();
  const dir = useFamilyDirectory();
  if (history.status !== 'ok') return <CardFallback state={history} from={megaName} />;
  const row = history.data.page.find((r) => r._id === ledgerId);
  if (!row) return <CardFallback state={{ status: 'error', error: new Error('older entry') }} from={megaName} />;
  return (
    <BucksMomentView
      by={dir.nameOf(row.byId)}
      amount={row.delta}
      sourceKind={row.source.kind}
      balance={balance.status === 'ok' ? balance.data.balance : null}
      onOpenStore={() => router.push('/store')}
    />
  );
}
