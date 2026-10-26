import { Stack } from 'expo-router';

export default function MegaProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="look" />
      <Stack.Screen name="memories" />
    </Stack>
  );
}
