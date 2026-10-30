// Closing any modal, sheet or full-screen overlay (owner, Oct 28: "make sure ... i am able to close all
// opened modals"). Every one gets the same four ways out:
//   CloseButton    a visible ✕, at least 44pt
//   useDismiss     Android's back button and Escape on web
//   useSwipeDown   dragging a bottom sheet down (responder props: native, web and inside <Modal>)
//   a scrim tap    (the overlay's own Pressable behind the panel)
import { useEffect, useRef } from 'react';
import { BackHandler, Platform, Pressable, type GestureResponderEvent, type GestureResponderHandlers } from 'react-native';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { Path, Svg } from 'react-native-svg';
import { MODAL_COPY } from '@shared/config/copy';
import { SHEET_DISMISS } from '@shared/config/theme';
import { hiddenFromA11y } from './a11y';
import { Text } from './Text';
import { useTokens } from './theme';
import { webKeyTarget } from './webKeys';

// Escape closes one layer at a time (G4 UX review, Oct 28: one press closed an Edit sheet and the Places
// screen under it). Every open overlay pushes itself here; one page listener calls only the topmost.
// Overlays (bottom sheets) always sit above screens; React runs a child's effects before its parent's, so
// registration order alone can't tell which is on top.
export type DismissLayer = 'screen' | 'overlay';
type EscapeLayer = { close: { current: () => void }; kind: DismissLayer };
const escapeLayers: EscapeLayer[] = [];
let escapeTarget: ReturnType<typeof webKeyTarget>;
const onEscapeKey = (e: { key: string }) => {
  if (e.key !== 'Escape') return;
  const overlays = escapeLayers.filter((l) => l.kind === 'overlay');
  const top = overlays[overlays.length - 1] ?? escapeLayers[escapeLayers.length - 1];
  top?.close.current();
};

function pushEscapeLayer(layer: EscapeLayer): () => void {
  if (escapeLayers.length === 0) {
    escapeTarget = webKeyTarget();
    escapeTarget?.addEventListener('keydown', onEscapeKey);
  }
  escapeLayers.push(layer);
  return () => {
    const i = escapeLayers.indexOf(layer);
    if (i >= 0) escapeLayers.splice(i, 1);
    if (escapeLayers.length === 0) escapeTarget?.removeEventListener('keydown', onEscapeKey);
  };
}

/** Android back and web Escape close the overlay while it's open. `androidBack: false` for a route modal,
 * where the navigator already pops it on back (handling it twice would close two screens). On web only the
 * topmost open overlay answers Escape. */
export function useDismiss(onClose: () => void, { enabled = true, androidBack = true, layer = 'screen' }: { enabled?: boolean; androidBack?: boolean; layer?: DismissLayer } = {}) {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS === 'web') return pushEscapeLayer({ close: latest, kind: layer });
    if (Platform.OS === 'android' && androidBack) {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        latest.current();
        return true;
      });
      return () => sub.remove();
    }
  }, [enabled, androidBack, layer]);
}

/** A released drag closes the sheet when it went far enough down, or was flicked down fast enough. */
export function swipeDismisses({ dy, vy }: { dy: number; vy: number }): boolean {
  return dy > SHEET_DISMISS.swipeDistance || vy > SHEET_DISMISS.swipeVelocity;
}

/** Drag a bottom sheet down to close it: returns the responder handlers for the panel and the drag offset
 * (apply it as the panel's translateY). Released past the distance or flicked: closes; otherwise springs back. */
export function useSwipeDown(onClose: () => void): { handlers: GestureResponderHandlers; dragY: SharedValue<number> } {
  const dragY = useSharedValue(0);
  // Where the drag started (page y and time), set on the first move that claims it.
  const start = useRef<{ y: number; t: number } | null>(null);
  const delta = (e: GestureResponderEvent) => e.nativeEvent.pageY - (start.current?.y ?? e.nativeEvent.pageY);
  const reset = () => {
    start.current = null;
    dragY.set(withTiming(0));
  };
  // The plain responder props (not PanResponder): a drag that moves more down than sideways claims it, so
  // taps on the sheet's buttons and sideways scrolling still go to them.
  const handlers: GestureResponderHandlers = {
    onMoveShouldSetResponder: (e) => {
      if (!e?.nativeEvent) return false; // asked without a touch (a capability probe): never claim
      if (!start.current) start.current = { y: e.nativeEvent.pageY, t: e.nativeEvent.timestamp };
      return e.nativeEvent.pageY - start.current.y > SHEET_DISMISS.startSlop;
    },
    onResponderMove: (e) => dragY.set(Math.max(0, delta(e))),
    onResponderRelease: (e) => {
      const dy = delta(e);
      const ms = Math.max(1, e.nativeEvent.timestamp - (start.current?.t ?? e.nativeEvent.timestamp));
      if (swipeDismisses({ dy, vy: dy / ms })) {
        start.current = null;
        onClose();
      } else reset();
    },
    onResponderTerminate: reset,
  };
  return { handlers, dragY };
}

/** The visible ✕ every overlay has (≥44pt, larger for kids through tokens.touchTarget). */
export function CloseButton({ onPress, label = MODAL_COPY.close, testID, variant = 'plain' }: { onPress: () => void; label?: string; testID?: string; variant?: 'plain' | 'filled' }) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={tokens.hitSlop}
      testID={testID}
      style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center', ...(variant === 'filled' ? { borderRadius: tokens.touchTarget / 2, backgroundColor: tokens.line } : {}) }}
    >
      {variant === 'filled' ? (
        <Svg {...hiddenFromA11y()} width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path d="M6 6l12 12M18 6 6 18" stroke={tokens.text} strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
      ) : <Text variant="title" {...hiddenFromA11y()}>✕</Text>}
    </Pressable>
  );
}
