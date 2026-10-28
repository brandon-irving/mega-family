// Board KidsMorning: the kid's morning, one step per tap. Their MEGA bobs above the current step and cheers
// ("Nice!") on each Done!; progress dots, "Step 2 of 4", the step's title and detail, and a four-up strip
// of every step. Reduced motion: the MEGA stands still and the cheer appears without a pop. Steps come from
// the kid's `routines.today('morning')` run (config ROUTINES.morningSteps by default; parents edit them).
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import type { LookParts } from '@/ui/MegaSprite';
import type { StickerId } from '@shared/config/looks';
import { fillCopy, KIDS_COPY } from '@shared/config/copy';
import { readableOn } from '@shared/config/theme';
import { Button } from '@/ui/Button';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { ProgressDots } from '@/ui/ThreadCard';

export type MorningStep = { id: string; label: string; detail?: string; done: boolean };
export type MorningMega = { hex: string; sticker: StickerId; parts?: LookParts };

/** A MEGA that bobs gently (still under reduced motion). */
export function BobbingMega({ mega, happy, scale }: { mega: MorningMega; happy: boolean; scale: number }) {
  const tokens = useTokens();
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    y.value = withRepeat(withSequence(withTiming(-4, { duration: tokens.durations.slow + 50 }), withTiming(0, { duration: tokens.durations.slow + 50 })), -1);
  }, [y, reduced, tokens.durations.slow]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={style}>
      <MegaSprite hex={mega.hex} sticker={mega.sticker} parts={mega.parts} face={happy ? 'happy' : 'open'} scale={scale} accessibilityLabel="Your MEGA" />
    </Animated.View>
  );
}

/** A pixel-style speech bubble ("Nice!"). */
export function CheerBubble({ text }: { text: string }) {
  const tokens = useTokens();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      entering={reduced ? undefined : ZoomIn.duration(tokens.durations.slow)}
      accessibilityLiveRegion="polite"
      style={{ paddingHorizontal: tokens.spacing.md, paddingVertical: 6, borderWidth: 3, borderColor: tokens.bg, borderRadius: 10, backgroundColor: tokens.text }}
    >
      <Text variant="title" style={{ color: tokens.bg }}>
        {text}
      </Text>
    </Animated.View>
  );
}

export function MorningRoutineView({
  kidName,
  mega,
  steps,
  dateLine,
  onDone,
  onStartOver,
}: {
  kidName: string;
  mega: MorningMega;
  steps: MorningStep[];
  dateLine: string;
  onDone: (stepId: string) => void;
  onStartOver: () => void;
}) {
  const tokens = useTokens();
  const [cheer, setCheer] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);
  const current = steps.findIndex((s) => !s.done);
  const finished = current < 0;
  const step = finished ? null : steps[current];
  const doneCount = steps.filter((s) => s.done).length;
  const tapDone = () => {
    if (!step) return;
    onDone(step.id);
    setCheer(KIDS_COPY.morningCheers[doneCount % KIDS_COPY.morningCheers.length]);
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(() => setCheer(null), tokens.durations.greeting * 0.7);
  };
  const bubble = finished ? KIDS_COPY.morningCheers[KIDS_COPY.morningCheers.length - 1] : cheer;
  return (
    <View style={{ flex: 1, padding: tokens.spacing.lg, gap: tokens.spacing.lg }}>
      <View style={{ gap: 2 }}>
        <Text variant="label" color="muted">
          {dateLine}
        </Text>
        <Text variant="display" accessibilityRole="header">
          {fillCopy(finished ? KIDS_COPY.morningAllSet : KIDS_COPY.morningGreeting, { kid: kidName })}
        </Text>
      </View>
      <View style={{ height: 230, alignItems: 'center', justifyContent: 'flex-end' }}>
        {bubble && (
          <View style={{ position: 'absolute', top: 6, left: '55%' }}>
            <CheerBubble key={bubble + doneCount} text={bubble} />
          </View>
        )}
        <BobbingMega mega={mega} happy={!!bubble} scale={5} />
      </View>
      <View accessibilityLabel="Current step" style={{ borderRadius: tokens.radii.xl, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.line, padding: tokens.spacing.lg, gap: tokens.spacing.md }}>
        <ProgressDots dots={steps.map((s, i) => (s.done ? 'done' : i === current ? 'current' : 'todo'))} label="" />
        <Text variant="label" style={{ color: tokens.hint }}>
          {finished ? KIDS_COPY.morningFinishedCount : fillCopy(KIDS_COPY.morningStep, { n: current + 1, total: steps.length })}
        </Text>
        <Text variant="display">{finished ? KIDS_COPY.morningFinishedTitle : step?.label}</Text>
        {!finished && step?.detail ? <Text color="muted">{step.detail}</Text> : null}
        {finished ? (
          <Button label={KIDS_COPY.morningStartOver} variant="secondary" onPress={onStartOver} size={{ height: 64, fontSize: tokens.type.title.fontSize }} />
        ) : (
          <Button label={KIDS_COPY.morningDoneButton} onPress={tapDone} size={{ height: 64, fontSize: tokens.type.headline.fontSize }} />
        )}
      </View>
      <View accessibilityRole="list" accessibilityLabel="Morning steps" style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        {steps.map((s, i) => {
          const on = i === current;
          const dot = s.done ? tokens.hintLine : on ? tokens.hint : tokens.line;
          return (
            <View
              key={s.id}
              accessibilityLabel={`${s.label}${s.done ? ', done' : ''}`}
              style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderRadius: tokens.radii.lg, backgroundColor: on ? tokens.hintSurface : tokens.surface, borderWidth: 1, borderColor: on ? tokens.hintLine : tokens.line, opacity: i > current && !finished ? 0.7 : 1 }}
            >
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: dot, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="label" style={{ color: readableOn(dot) }}>
                  {s.done ? '✓' : String(i + 1)}
                </Text>
              </View>
              <Text variant="caption" weight="600" style={{ textAlign: 'center' }} numberOfLines={2}>
                {s.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
