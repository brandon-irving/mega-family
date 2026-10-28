// Hiding decoration (sprites, icons, color bars) from screen readers, the right way per platform. iOS and
// Android use `accessibilityElementsHidden` / `importantForAccessibility`; on web those reach the DOM
// unrecognized (react-native-svg forwards unknown props to <svg>) and React logs an error, so web uses
// `aria-hidden`. Spread the result onto the element: `<Svg {...hiddenFromA11y()} … />`.
import { Platform } from 'react-native';

export type HiddenProps =
  | { 'aria-hidden'?: true }
  | { accessibilityElementsHidden: boolean; importantForAccessibility: 'auto' | 'no-hide-descendants' };

export function hiddenFromA11y(hidden = true): HiddenProps {
  if (Platform.OS === 'web') return hidden ? { 'aria-hidden': true } : {};
  return { accessibilityElementsHidden: hidden, importantForAccessibility: hidden ? 'no-hide-descendants' : 'auto' };
}
