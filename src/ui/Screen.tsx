import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTokens } from './theme';

export type ScreenProps = { children: ReactNode; scroll?: boolean; padded?: boolean; testID?: string };

/** The full-bleed background every screen sits on, in the theme's bg color, respecting safe areas. */
export function Screen({ children, scroll = false, padded = true, testID }: ScreenProps) {
  const tokens = useTokens();
  const Container = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: tokens.bg }]} testID={testID}>
      <Container
        style={scroll ? styles.fill : [styles.fill, padded && { padding: tokens.spacing.lg }]}
        contentContainerStyle={scroll ? (padded ? { padding: tokens.spacing.lg } : undefined) : undefined}
      >
        {children}
      </Container>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
