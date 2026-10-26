import { Stack } from 'expo-router';
import { useThemedStackOptions } from '@/features/shell/stackOptions';

export default function ChatLayout() {
  return (
    <Stack screenOptions={useThemedStackOptions()}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[messageId]" />
    </Stack>
  );
}
