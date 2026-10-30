import { router } from '@/features/shell/navigation';
import { Pressable } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTokens } from '@/ui/theme';
import { hiddenFromA11y } from '@/ui/a11y';

/** A consistent, reachable Settings entry on the main screens. */
export function AppSettingsButton() {
  const tokens = useTokens();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push('/settings')}
      style={({ pressed }) => ({ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: pressed ? tokens.line : 'transparent' })}>
      <Svg {...hiddenFromA11y()} width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={tokens.text} strokeWidth={1.7}>
        <Path d="m9.5 3-.6 2.2-2 .9-2-.6-2.4 4.2 1.5 1.6v2.4L2.5 15l2.4 4.2 2-.6 2 .9.6 2.2h5l.6-2.2 2-.9 2 .6 2.4-4.2-1.5-1.3v-2.4l1.5-1.6-2.4-4.2-2 .6-2-.9L14.5 3Z" strokeLinejoin="round" />
        <Circle cx={12} cy={12.3} r={3.1} />
      </Svg>
    </Pressable>
  );
}
