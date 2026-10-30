import { Stack } from 'expo-router';
import { useThemedStackOptions } from '@/features/shell/stackOptions';

export default function IdeasLayout() {
  return (
    <Stack screenOptions={useThemedStackOptions()}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
