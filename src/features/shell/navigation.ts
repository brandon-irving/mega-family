import { demoRecorder } from '@/services/demoRecording';
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
  demoRecorder.event('navigation.push', { route: typeof href === 'string' ? href.split('?')[0].replace(/(\/join\/).*/, '$1[invite]') : href.pathname });
  expoRouter.push(href);
}
function back() {
  const now = Date.now();
  if (now - closedAt < NAVIGATION.transitionGuardMs) return;
  demoRecorder.event('navigation.back');
  closedAt = now;
  lastOpen = '';
  if (expoRouter.canGoBack()) expoRouter.back();
  else expoRouter.replace(NAVIGATION.fallbackRoute);
}
/** Modal exits to a tab must dismiss the root presentation before selecting that tab. */
function toTab(href: Href) {
  demoRecorder.event('navigation.tab', { route: typeof href === 'string' ? href.split('?')[0] : href.pathname });
  if (expoRouter.canDismiss()) expoRouter.dismissAll();
  expoRouter.navigate(href);
}
// SDK 58 binds imperative methods after the first render. Spreading the router eagerly
// captures its pre-render throwing functions forever; forward properties at call time.
export const router = new Proxy(expoRouter as typeof expoRouter & { toTab: typeof toTab }, {
  get(target, property, receiver) {
    if (property === 'push') return push;
    if (property === 'back') return back;
    if (property === 'toTab') return toTab;
    return Reflect.get(target, property, receiver);
  },
});

/** Reset transition bookkeeping when starting a new navigation session. */
export function resetNavigationGuard() { lastOpen = ''; openedAt = -Infinity; closedAt = -Infinity; }
