import { DataProvider } from '@/data/client';
import { AppThemeProvider } from '@/features/shell/AppThemeProvider';
import { AuthGate } from '@/features/shell/AuthGate';

export default function RootLayout() {
  return (
    <DataProvider>
      <AppThemeProvider>
        <AuthGate />
      </AppThemeProvider>
    </DataProvider>
  );
}
