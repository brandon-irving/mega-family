// Settings placeholder (G1 scope item 9 — theme/wallpaper/family sections are a later gate). Sign out
// lives here (PLAN.md → Sign-in): the root layout's gate reacts to the session ending and sends the app
// back to Welcome on its own, so this just calls the auth service and closes the sheet.
import { router } from 'expo-router';
import { signOut } from '@/services/auth';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export default function SettingsRoute() {
  const tokens = useTokens();
  return (
    <Sheet title="Settings" onClose={() => router.back()}>
      <Text color="muted">Theme, wallpaper and family settings arrive in a later milestone.</Text>
      <Button label="Sign out" variant="secondary" style={{ marginTop: tokens.spacing.lg }} onPress={() => signOut()} />
    </Sheet>
  );
}
