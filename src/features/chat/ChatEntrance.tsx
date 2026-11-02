import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject, type ComponentRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { CHAT_UX } from '@shared/config/chat';
import { CHARACTER_EDITOR } from '@shared/config/characterEditor';
import type { FrameName } from '@shared/sprite';
import type { Id } from '@shared/domain/validators';
import { useChatEntrance, useFinishChatEntrance } from '@/data/useChat';
import type { MegaInfo } from '@/features/shell/megaInfo';
import { MegaSprite } from '@/ui/MegaSprite';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { hiddenFromA11y } from '@/ui/a11y';

const C = CHAT_UX.entrance;
const WALK = CHARACTER_EDITOR.introduction;
type Geometry = { width: number; height: number; targetX: number; targetY: number };
type Anchors = { avatarRef: RefObject<ComponentRef<typeof View> | null>; onAvatarLayout: () => void };

/** Mount keyed by member: private history and presentation state never carry across profile switches. */
export function ChatEntrance({ memberId, mega, children, hasHistory = false }: { hasHistory?: boolean; memberId: Id<'members'>; mega: MegaInfo; children: (anchors: Anchors) => ReactNode }) {
  const tokens = useTokens();
  const status = useChatEntrance(memberId);
  const finish = useFinishChatEntrance();
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const root = useRef<ComponentRef<typeof View>>(null);
  const avatarRef = useRef<ComponentRef<typeof View>>(null);
  const mounted = useRef(true);
  const completed = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const complete = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    setDone(true);
    // An offline acknowledgement must never trap the user behind an animation.
    void finish({ profileKey: memberId }).catch(() => {});
  }, [finish, memberId]);
  const measure = useCallback(() => {
    root.current?.measureInWindow((rx, ry, width, height) => {
      avatarRef.current?.measureInWindow((ax, ay, aw, ah) => {
        if (!mounted.current || width <= 0 || height <= 0 || aw <= 0 || ah <= 0) return;
        setGeometry(previous => {
          const next = { width, height, targetX: ax - rx + aw / 2, targetY: ay - ry + ah / 2 };
          return previous && Object.keys(next).every(k => previous[k as keyof Geometry] === next[k as keyof Geometry]) ? previous : next;
        });
      });
    });
  }, []);
  const covered = !hasHistory && !done && (status.status === 'loading' || (status.status === 'ok' && status.data.pending));
  useEffect(() => {
    if (!covered) return;
    // No skip control: fail open if status or native layout cannot resolve.
    const timer = setTimeout(complete, C.fallbackMs);
    return () => clearTimeout(timer);
  }, [covered, complete]);
  const reveal = useCallback(() => setRevealed(true), []);
  return <View ref={root} collapsable={false} onLayout={measure} style={{ flex: 1 }}>
    <View style={{ flex: 1, opacity: covered && !revealed ? 0 : 1 }} pointerEvents={covered ? 'none' : 'auto'} {...hiddenFromA11y(covered)}>
      {children({ avatarRef, onAvatarLayout: measure })}
    </View>
    {covered ? <View style={StyleSheet.absoluteFill} testID="chat-entrance">
      {status.status === 'ok' && geometry ? <EntranceAnimation key={`${geometry.width}:${geometry.height}`} mega={mega} geometry={geometry} onReveal={reveal} onComplete={complete} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: tokens.bg }]} />}
    </View> : null}
  </View>;
}

/** A bounded walk → wave → badge transition. No perpetual frame loop, including while backgrounded. */
export function EntranceAnimation({ mega, geometry, onComplete, onReveal }: { onReveal?: () => void; mega: MegaInfo; geometry: Geometry; onComplete: () => void }) {
  const tokens = useTokens();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const [pose, setPose] = useState<FrameName>('stand');
  const [phase, setPhase] = useState<'walk' | 'wave' | 'greeting' | 'dock' | 'typing'>(reduced ? 'typing' : 'walk');
  const size = 40 * C.spriteScale;
  const centerX = geometry.width / 2;
  const centerY = Math.max(size, geometry.height * 0.4);
  const x = useSharedValue(reduced ? geometry.targetX : -size);
  const y = useSharedValue(reduced ? geometry.targetY : centerY);
  const scale = useSharedValue(1);
  const morph = useSharedValue(reduced ? 1 : 0);
  const opacity = useSharedValue(reduced ? 0 : 1);
  const stage = useSharedValue(1);
  const stageStyle = useAnimatedStyle(() => ({ opacity: stage.value }));
  const position = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateX: x.value - size / 2 }, { translateY: y.value - size / 2 }] }));
  const spriteStyle = useAnimatedStyle(() => ({ opacity: 1 - morph.value, transform: [{ scale: scale.value }] }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: morph.value }));
  useEffect(() => {
    if (!focused) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let frames: ReturnType<typeof setInterval> | undefined;
    const later = (fn: () => void, delay: number) => timers.push(setTimeout(fn, delay));
    const cancel = () => {
      timers.forEach(clearTimeout); clearInterval(frames);
      [x, y, scale, morph, opacity, stage].forEach(cancelAnimation);
    };
    if (AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
    if (reduced) {
      later(() => { setPhase('typing'); onReveal?.(); }, 0);
      stage.set(withTiming(0, { duration: C.reducedMs }));
      x.set(geometry.targetX); y.set(geometry.targetY); morph.set(1);
      opacity.set(withTiming(1, { duration: C.reducedMs }));
      later(onComplete, C.reducedMs + C.typingMs);
    } else {
      later(() => { setPhase('walk'); setPose('stand'); }, 0);
      x.set(-size); y.set(centerY); scale.set(1); morph.set(0); opacity.set(1);
      x.set(withTiming(centerX, { duration: C.walkMs, easing: Easing.linear }));
      let step = 0;
      frames = setInterval(() => setPose(++step % 2 ? 'stepL' : 'stepR'), WALK.frameMs);
      later(() => {
        clearInterval(frames); setPhase('wave'); setPose('waveIn');
        let wave = 0;
        frames = setInterval(() => setPose(++wave % 2 ? 'waveOut' : 'waveIn'), WALK.waveFrameMs);
      }, C.walkMs);
      const greetingAt = C.walkMs + C.waveFrames * WALK.waveFrameMs;
      later(() => { clearInterval(frames); setPose('stand'); setPhase('greeting'); }, greetingAt);
      const dockAt = greetingAt + C.greetingMs;
      later(() => {
        clearInterval(frames); setPhase('dock'); setPose('stand');
        onReveal?.();
        stage.set(withTiming(0, { duration: C.dockMs }));
        x.set(withTiming(geometry.targetX, { duration: C.dockMs }));
        y.set(withTiming(geometry.targetY, { duration: C.dockMs }));
        scale.set(withTiming(C.badgeSize / size, { duration: C.dockMs }));
        morph.set(withTiming(1, { duration: C.dockMs }));
      }, dockAt);
      later(() => setPhase('typing'), dockAt + C.dockMs);
      later(onComplete, dockAt + C.dockMs + C.typingMs);
    }
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { cancel(); onComplete(); }
    });
    return () => { cancel(); subscription.remove(); };
  }, [focused, reduced, centerX, centerY, geometry.targetX, geometry.targetY, size, onComplete, x, y, scale, morph, opacity, stage, onReveal]);
  return <>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tokens.bg }, stageStyle]} />
    <Animated.View accessible={false} pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, position]}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }, spriteStyle]}>
        <MegaSprite hex={mega.hex} sticker={mega.sticker} face="happy" view={phase === 'walk' ? 'right' : 'front'} frame={pose} scale={C.spriteScale} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: (size - C.badgeSize) / 2, top: (size - C.badgeSize) / 2 }, badgeStyle]}>
        <MegaBadge hex={mega.hex} sticker={mega.sticker} face={mega.face} size={C.badgeSize} />
      </Animated.View>
    </Animated.View>
    {(phase === 'greeting' || phase === 'typing') && <View style={{ position: 'absolute', top: centerY + size, left: tokens.spacing.lg, right: tokens.spacing.lg, alignItems: 'center' }}>
      <View style={phase === 'greeting' ? { backgroundColor: tokens.surface, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.lg, padding: tokens.spacing.md } : undefined}>
        <Text variant="body" accessibilityLiveRegion="polite">{phase === 'typing' ? C.typing(mega.name) : C.greeting(mega.name)}</Text>
      </View>
    </View>}
  </>;
}
