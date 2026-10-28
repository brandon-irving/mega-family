// The walking-MEGA layer (Screen 9 boards; HQ reuses it in G5). Wrap a screen in <WalkerStage scene={…}>,
// mark the elements MEGAs can stand on with <Ledge id="…">, and the stage measures them, steps the engine
// (./engine.ts) on a timer and draws the MEGAs on top. Positions move on the UI thread (Reanimated shared
// values, eased linearly between engine steps); React only re-renders a MEGA when its picture changes (a new
// walk frame, a turn, a speech bubble), not every step.
import { type ComponentRef, createContext, memo, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { SIGNIN_COPY } from '@shared/config/copy';
import { WALKER_CAST, WALKER_IDS, WALKER_MOTION as M, type WalkerId } from '@shared/config/walkers';
import { assignPlan, createWalker, lookAt, pokedLedges, pose, tapWalker, tickWalker, weightedLedges, type Ledges, type Pose, type Scene, type Walker } from './engine';

type ViewRef = ComponentRef<typeof View>;
type Measurable = ViewRef | null;
/** `inset`: where MEGAs stand, in points below the element's top edge (the wordmark's capitals sit lower
 * than its line box). */
type LedgeOpts = { pressable?: boolean; inset?: number };
type StageCtx = {
  register: (id: string, el: Measurable, opts: LedgeOpts) => void;
  unregister: (id: string) => void;
  /** Everyone turns toward this ledge (call it from the element's onPress). */
  lookAtLedge: (id: string) => void;
  dipped: ReadonlySet<string>;
  poked: ReadonlySet<string>;
};

const Ctx = createContext<StageCtx | null>(null);
/** Exported for WalkerStage.test.tsx only (it drives a ledge with a fake stage). */
export const WalkerStageContext = Ctx;
export type { StageCtx };
const EMPTY: ReadonlySet<string> = new Set();
const setKey = (s: ReadonlySet<string>) => [...s].sort().join('|');

export type WalkerStageProps = {
  /** What each MEGA does on this screen. Pass a stable (memoized) value; a new scene restarts the scripts. */
  scene: Scene;
  children: ReactNode;
  /** Something is loading (a sign-in in flight): the lead MEGA shows "…". */
  busy?: boolean;
  /** Drawn above the MEGAs on the base layer and below those on top (a sheet and its scrim: MEGAs it slides
   * over are dimmed, a MEGA that hopped onto it with ON_TOP stays in front). */
  overlay?: ReactNode;
  /** Overrides the system setting (tests, previews). */
  reducedMotion?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function WalkerStage({ scene, children, overlay, busy = false, reducedMotion, style, testID }: WalkerStageProps) {
  const systemReduced = useReducedMotion();
  const reduced = reducedMotion ?? systemReduced;
  const stageRef = useRef<ViewRef>(null);
  const elements = useRef(new Map<string, { el: Measurable; opts: LedgeOpts }>());
  const ledges = useRef<Ledges>({});
  const walkers = useRef<Record<WalkerId, Walker>>(Object.fromEntries(WALKER_IDS.map((id) => [id, createWalker(id)])) as Record<WalkerId, Walker>);
  const listeners = useRef(new Map<WalkerId, (p: Pose) => void>());
  const [dipped, setDipped] = useState<ReadonlySet<string>>(EMPTY);
  const [poked, setPoked] = useState<ReadonlySet<string>>(EMPTY);
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const ctx = useCallback(() => ({ now: Date.now(), ledges: ledges.current, reduced }), [reduced]);

  // Measure every ledge relative to the stage (window coordinates of both, subtracted: works the same on
  // native and web, and the sign-in screens never scroll).
  const measureAll = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.measureInWindow((sx, sy) => {
      elements.current.forEach(({ el, opts }, id) => {
        el?.measureInWindow((x, y, w) => {
          if (w > 0) ledges.current[id] = { x: x - sx, y: y - sy + (opts.inset ?? 0), w, pressable: !!opts.pressable };
        });
      });
    });
  }, []);

  const register = useCallback(
    (id: string, el: Measurable, opts: LedgeOpts) => {
      elements.current.set(id, { el, opts });
      measureAll();
    },
    [measureAll],
  );
  const unregister = useCallback((id: string) => {
    elements.current.delete(id);
    delete ledges.current[id];
  }, []);
  const lookAtLedge = useCallback((id: string) => {
    const l = ledges.current[id];
    if (l) lookAt(Object.values(walkers.current), { x: l.x + l.w / 2, y: l.y + 1 }, Date.now());
  }, []);

  // A new scene (or a reduced-motion change) restarts every MEGA's script.
  useEffect(() => {
    const c = ctx();
    for (const id of WALKER_IDS) assignPlan(walkers.current[id], scene[id], c);
  }, [scene, ctx]);

  useEffect(() => {
    const step = () => {
      const c = ctx();
      const all = Object.values(walkers.current);
      for (const m of all) tickWalker(m, c);
      const d = weightedLedges(all, c.ledges);
      const p = pokedLedges(all);
      setDipped((prev) => (setKey(prev) === setKey(d) ? prev : d));
      setPoked((prev) => (setKey(prev) === setKey(p) ? prev : p));
      const sayHi = (id: WalkerId) => SIGNIN_COPY.sayHi(WALKER_CAST[id].name);
      for (const m of all) listeners.current.get(m.id)?.(pose(m, { ...c, dipped: d, sayHi, busy: busyRef.current && m.id === 'teal' }));
    };
    step();
    const timer = setInterval(step, M.tickMs);
    return () => clearInterval(timer);
  }, [ctx]);

  const subscribe = useCallback((id: WalkerId, fn: (p: Pose) => void) => {
    listeners.current.set(id, fn);
    return () => {
      listeners.current.delete(id);
    };
  }, []);
  const tap = useCallback((id: WalkerId) => tapWalker(walkers.current[id], Date.now()), []);

  const value = useMemo<StageCtx>(() => ({ register, unregister, lookAtLedge, dipped, poked }), [register, unregister, lookAtLedge, dipped, poked]);

  return (
    <Ctx.Provider value={value}>
      <View ref={stageRef} style={[styles.fill, style]} onLayout={measureAll} testID={testID}>
        {children}
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {overlay ? (
            <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.overlay]}>
              {overlay}
            </View>
          ) : null}
          {WALKER_IDS.map((id) => (
            <WalkerSprite key={id} id={id} reduced={reduced} subscribe={subscribe} onTap={tap} />
          ))}
        </View>
      </View>
    </Ctx.Provider>
  );
}

type Picture = Omit<Pose, 'x' | 'y'>;
const pictureKey = (p: Picture) => `${p.visible}|${p.view}|${p.frame}|${p.expression}|${p.say}|${p.emote}|${p.top}`;

type SpriteProps = { id: WalkerId; reduced: boolean; subscribe: (id: WalkerId, fn: (p: Pose) => void) => () => void; onTap: (id: WalkerId) => void };

const WalkerSprite = memo(function WalkerSprite({ id, reduced, subscribe, onTap }: SpriteProps) {
  const tokens = useTokens();
  const half = M.hitSize / 2;
  const x = useSharedValue(-M.hitSize * 2);
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  const [pic, setPic] = useState<Picture | null>(null);
  const lastKey = useRef('');
  const lastPos = useRef({ x: -1e4, y: -1e4 });
  useEffect(
    () =>
      subscribe(id, (p) => {
        // Small moves ease linearly over one engine step (smooth at any frame rate); a teleport jumps.
        const jump = Math.abs(p.x - lastPos.current.x) > 24 || Math.abs(p.y - lastPos.current.y) > 60;
        const nx = p.x - half;
        const ny = p.y - M.hitSize;
        if (jump || reduced) {
          x.value = nx;
          y.value = ny;
        } else {
          x.value = withTiming(nx, { duration: M.tickMs, easing: Easing.linear });
          y.value = withTiming(ny, { duration: M.tickMs, easing: Easing.linear });
        }
        lastPos.current = { x: p.x, y: p.y };
        opacity.value = withTiming(p.visible ? 1 : 0, { duration: reduced ? 0 : 300 });
        const { x: _x, y: _y, ...picture } = p;
        const key = pictureKey(picture);
        if (key !== lastKey.current) {
          lastKey.current = key;
          setPic(picture);
        }
      }),
    [subscribe, id, half, reduced, x, y, opacity],
  );

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateX: x.value }, { translateY: y.value }] }));
  const cast = WALKER_CAST[id];
  return (
    <Animated.View pointerEvents={pic?.visible ? 'box-none' : 'none'} style={[styles.walker, { width: M.hitSize, height: M.hitSize, zIndex: pic?.top ? LAYER.top : LAYER.base }, animated]}>
      <Pressable
        onPress={() => onTap(id)}
        accessibilityRole="button"
        accessibilityLabel={SIGNIN_COPY.sayHiLabel(cast.name)}
        accessibilityElementsHidden={!pic?.visible}
        importantForAccessibility={pic?.visible ? 'auto' : 'no-hide-descendants'}
        style={styles.hit}
        testID={`walker-${id}`}
      >
        {pic && <MegaSprite hex={cast.hex} sticker="none" view={pic.view} frame={pic.frame} face={pic.expression} scale={M.spriteScale} accessibilityLabel={cast.name} />}
      </Pressable>
      {pic?.emote ? (
        <Text variant="label" style={[styles.emote, { color: tokens.text }]} pointerEvents="none">
          {pic.emote}
        </Text>
      ) : null}
      {pic?.say ? (
        <View pointerEvents="none" style={[styles.bubble, { backgroundColor: tokens.text, borderRadius: tokens.radii.md, paddingHorizontal: tokens.spacing.sm, paddingVertical: tokens.spacing.xs, bottom: M.hitSize + tokens.spacing.xs }]}>
          <Text variant="caption" weight="700" style={{ color: tokens.bg }} numberOfLines={1}>
            {pic.say}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
});

/** Something MEGAs can stand on: its top edge becomes ledge `id`. A pressable ledge dips while stood on. */
export function useLedge(id: string, { pressable = false, inset = 0 }: LedgeOpts = {}) {
  const stage = useContext(Ctx);
  const ref = useRef<ViewRef>(null);
  // Depend on the stage's stable callbacks, never the context object itself: it changes whenever a ledge dips
  // or gets poked, and re-running the cleanup then would unregister every ledge (the MEGAs would stop dead,
  // waiting for ledges that are never measured again — seen live on web, Oct 28).
  const register = stage?.register;
  const unregister = stage?.unregister;
  const onLayout = useCallback(
    (_e?: LayoutChangeEvent) => {
      register?.(id, ref.current, { pressable, inset });
    },
    [register, id, pressable, inset],
  );
  useEffect(() => () => unregister?.(id), [unregister, id]);
  return {
    ref,
    onLayout,
    dipped: !!stage?.dipped.has(id),
    poked: !!stage?.poked.has(id),
    lookHere: () => stage?.lookAtLedge(id),
  };
}

/** A wrapper that makes its child a ledge. `children` may be a function of `{ poked, lookHere }`: light up
 * when a MEGA points at it (the boards' accent ring), and make everyone turn toward it when pressed. */
export function Ledge({ id, pressable, inset, style, children }: LedgeOpts & { id: string; style?: StyleProp<ViewStyle>; children?: ReactNode | ((s: { poked: boolean; lookHere: () => void }) => ReactNode) }) {
  const { ref, onLayout, dipped, poked, lookHere } = useLedge(id, { pressable, inset });
  const tokens = useTokens();
  const dip = useSharedValue(0);
  useEffect(() => {
    dip.value = withTiming(dipped ? M.dip : 0, { duration: tokens.durations.fast });
  }, [dipped, dip, tokens.durations.fast]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: dip.value }] }));
  // Measured on a plain inner View so the dip (a transform) never feeds back into the ledge's own position.
  return (
    <Animated.View style={[style, animated]}>
      <View ref={ref} onLayout={onLayout} collapsable={false}>
        {typeof children === 'function' ? children({ poked, lookHere }) : children}
      </View>
    </Animated.View>
  );
}

const LAYER = { base: 1, overlay: 2, top: 3 } as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: { zIndex: LAYER.overlay },
  walker: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'flex-end' },
  hit: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  emote: { position: 'absolute', top: -14 },
  bubble: { position: 'absolute', alignSelf: 'center', minWidth: 80, alignItems: 'center' },
});
