// The one place that reads the public Convex site URL from env — src/services/auth.ts (Better Auth's
// `baseURL`) and src/services/backgroundNotificationTask.ts (the killed-app `push/answer` route, which
// has no Convex client/session to derive it from) both need the same value; a single source means it
// can't drift between the two. Not a secret — this is the EAS/dev `EXPO_PUBLIC_*` build var, same as
// every other `EXPO_PUBLIC_CONVEX_*` read in the app.
export const CONVEX_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;

if (!CONVEX_SITE_URL && __DEV__) {
  console.warn('EXPO_PUBLIC_CONVEX_SITE_URL is not set — sign-in and the killed-app push answer route will fail until .env.local is configured.');
}
