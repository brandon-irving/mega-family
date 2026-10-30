import { useEffect, useRef, type ReactNode } from 'react';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/** Keep tile routing coarse; interpolate the sprite and its tap target between tile updates. */
export function HqWalker({ x, y, scale, still, duration, children, testID }: {
  x: number; y: number; scale: number; still: boolean; duration: number; children: ReactNode; testID?: string;
}) {
  const left = useSharedValue(x);
  const top = useSharedValue(y);
  const previous = useRef({ x, y, scale, still });
  useEffect(() => {
    const old = previous.current;
    // A resized room or disabled motion must not animate across furniture from stale coordinates.
    const snap = still || old.still || old.scale !== scale;
    if (snap) {
      cancelAnimation(left);
      cancelAnimation(top);
      left.value = x;
      top.value = y;
    } else {
      if (x !== old.x) left.value = withTiming(x, { duration, easing: Easing.linear });
      if (y !== old.y) top.value = withTiming(y, { duration, easing: Easing.linear });
    }
    previous.current = { x, y, scale, still };
  }, [x, y, scale, still, duration, left, top]);
  useEffect(() => () => { cancelAnimation(left); cancelAnimation(top); }, [left, top]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: left.value }, { translateY: top.value }] }));
  return <Animated.View testID={testID} pointerEvents="box-none" style={[{ position: 'absolute', left: 0, top: 0 }, animated]}>{children}</Animated.View>;
}
