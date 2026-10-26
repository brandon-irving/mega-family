// Settings placeholder (G1 scope item 9 — theme/wallpaper/family sections are a later gate).
import { router } from 'expo-router';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

export default function SettingsRoute() {
  return (
    <Sheet title="Settings" onClose={() => router.back()}>
      <Text color="muted">Theme, wallpaper and family settings arrive in a later milestone.</Text>
    </Sheet>
  );
}
