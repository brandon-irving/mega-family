import { Stack } from 'expo-router';
import { useThemedStackOptions } from '@/features/shell/stackOptions';

export default function FamilyLayout() {
  return (
    <Stack screenOptions={useThemedStackOptions()}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
