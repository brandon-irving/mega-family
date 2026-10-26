import { Stack } from 'expo-router';
import { useThemedStackOptions } from '@/features/shell/stackOptions';

export default function FamilyLayout() {
  return (
    <Stack screenOptions={useThemedStackOptions()}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[memberId]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="calendar" options={{ presentation: 'modal' }} />
      <Stack.Screen name="lists" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
