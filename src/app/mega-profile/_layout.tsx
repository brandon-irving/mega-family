import { Stack } from 'expo-router';
import { useThemedStackOptions } from '@/features/shell/stackOptions';

export default function MegaProfileLayout() {
  return (
    <Stack screenOptions={useThemedStackOptions()}>
      <Stack.Screen name="index" />
      <Stack.Screen name="look" />
      <Stack.Screen name="memories" />
    </Stack>
  );
}
