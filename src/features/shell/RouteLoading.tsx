// The loading UI Expo Router shows while a route is suspended (the root layout exports it as its
// `SuspenseFallback`). It's the same walking-MEGA loader as the auth gate, so going from sign-in to the
// first chat frame never shows a blank screen (owner, Oct 28). Web needs `asyncRoutes: { web: false }` in
// app.config.ts for this to be used at all: SDK 58's async routes ignore custom fallbacks.
import { MegaLoader } from '@/features/walkers';

export function RouteLoading() {
  return <MegaLoader testID="route-loading" />;
}
