import { Stack } from 'expo-router';
import { DataProvider } from '@/data/client';
import { AppThemeProvider } from '@/features/shell/AppThemeProvider';

export default function RootLayout() {
  return (
    <DataProvider>
      <AppThemeProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="talk" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="today" options={{ presentation: 'modal' }} />
          <Stack.Screen name="mega-profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="join/[token]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="widgets" options={{ presentation: 'modal' }} />
        </Stack>
      </AppThemeProvider>
    </DataProvider>
  );
}
