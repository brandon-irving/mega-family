import { NAVIGATION } from '@shared/config/navigation';
import { router as expoRouter, type Href } from 'expo-router';

let lastOpen = '';
let openedAt = -Infinity;
let closedAt = -Infinity;
function push(href: Href) {
  const key = typeof href === 'string' ? href : JSON.stringify(href);
  const now = Date.now();
  if (key === lastOpen && now - openedAt < NAVIGATION.transitionGuardMs) return;
  lastOpen = key;
  openedAt = now;
  expoRouter.push(href);
}
function back() {
  const now = Date.now();
  if (now - closedAt < NAVIGATION.transitionGuardMs) return;
  closedAt = now;
  lastOpen = '';
  if (expoRouter.canGoBack()) expoRouter.back();
  else expoRouter.replace(NAVIGATION.fallbackRoute);
}
/** Modal exits to a tab must dismiss the root presentation before selecting that tab. */
function toTab(href: Href) {
  if (expoRouter.canDismiss()) expoRouter.dismissAll();
  expoRouter.navigate(href);
}
export const router = { ...expoRouter, push, back, toTab };

/** Reset transition bookkeeping when starting a new navigation session. */
export function resetNavigationGuard() { lastOpen = ''; openedAt = -Infinity; closedAt = -Infinity; }
