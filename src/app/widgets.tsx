// Widgets placeholder (G1 scope item 9 — the real home-screen widgets are a later gate).
import { router } from 'expo-router';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

export default function WidgetsRoute() {
  return (
    <Sheet title="Widgets" onClose={() => router.back()}>
      <Text color="muted">Home-screen and lock-screen widgets arrive in a later milestone.</Text>
    </Sheet>
  );
}
