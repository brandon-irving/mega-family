// The tabs' error screen, exported as `ErrorBoundary` by both tab layouts (web `_layout.tsx` and native
// `_layout.native.tsx`): owner device test, Oct 29 — it existed only on web, so on the phone a tab that
// threw had no boundary at all.
import type { ErrorBoundaryProps } from 'expo-router';
import { View } from 'react-native';
import { APP_ERROR_COPY } from '@shared/config/copy';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

/** G6 walkthrough fix (P0): Expo Router's per-route `ErrorBoundary` export convention
 * (docs.expo.dev/router, "Error boundaries") — a route that throws while rendering (e.g. the Family tab's
 * member detail firing `kidThread` for a member it can't read) looks for this on its own file first, then
 * walks up to the nearest ancestor layout that exports one. Exporting it here, once, on the tabs layout
 * means a single failed query inside *any* tab can never white-screen the whole app; `retry` re-renders
 * the route that threw by clearing the error state. */
export function TabErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const tokens = useTokens();
  // G6 review fix: the raw error.message used to show on screen under __DEV__, which could leak an
  // internal detail (a ConvexError's message, a stack-bearing string) into a dev build. Always show the
  // fixed copy; log the real error to the console (dev only) for the developer instead.
  if (__DEV__) console.error(error.message, error);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.lg, gap: tokens.spacing.md, backgroundColor: tokens.bg }}>
      <Text variant="headline" accessibilityRole="header">
        {APP_ERROR_COPY.title}
      </Text>
      <Text color="muted" style={{ textAlign: 'center' }}>
        {APP_ERROR_COPY.body}
      </Text>
      <Button label={APP_ERROR_COPY.retry} onPress={() => void retry()} />
    </View>
  );
}
