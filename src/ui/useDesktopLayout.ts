import { Platform, useWindowDimensions } from 'react-native';
import { DESKTOP_LAYOUT } from '@shared/config/theme';

export function useDesktopLayout() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_LAYOUT.breakpoint;
}
