import { MegaLoader } from '@/features/walkers';

/** Shown while a query is loading (undefined) — every screen that reads live data needs one. Owner rule:
 * a walking-MEGA loader, never a plain spinner (it used to be a bare ActivityIndicator). Reuses the same
 * loader as the auth gate and the route-change fallback (src/features/shell/RouteLoading.tsx) — one
 * component, so every route that shows it looks the same — with its own words in place of "Opening chats". */
export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return <MegaLoader text={label} />;
}
