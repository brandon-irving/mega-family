import { View } from 'react-native';
import { Circle, Path, Svg } from 'react-native-svg';
import { hiddenFromA11y } from './a11y';
import { useTokens } from './theme';
/** Neutral portrait used consistently until a family member has a MEGA. */
export function PersonAvatar({ size = 44 }: { size?: number }) {
  const tokens = useTokens();
  return <View testID="person-avatar" {...hiddenFromA11y()} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tokens.line, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={size * 0.65} height={size * 0.65} viewBox="0 0 24 24" fill={tokens.muted}>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 22v-2a8 8 0 0 1 16 0v2z" />
    </Svg>
  </View>;
}
