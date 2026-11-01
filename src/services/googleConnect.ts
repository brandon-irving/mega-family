import { SCHEDULING } from '@shared/config/scheduling';
// G5 (CONTRACT v0.17, docs/gates/G5.md decision 1): connecting Gmail / Google Calendar is its own Google grant,
// separate from signing in (the account MEGA reads can differ from the one you sign in with). Two paths, one
// result:
//  - Web: `integrations.googleStart` returns Google's consent URL; the app opens it in the same tab and Google's
//    redirect comes back through our Convex HTTP callback to `/chat?google=…`, where the thread already shows the
//    connected line. Only Google's own consent host is ever navigated to.
//  - iOS / Android: the installed @react-native-google-signin (v16) with `offlineAccess` and the read-only scopes
//    returns a one-time `serverAuthCode`, which the server exchanges (`integrations.googleConnectCode`). The SDK's
//    local session is cleared first so the account picker shows (the demo connects a synthetic Gmail while the
//    owner is signed in as themselves).
import { Platform } from 'react-native';
import { GOOGLE } from '@shared/config/google';
import type { AccountActions, GoogleProduct } from '@/data/useAccounts';

export type GoogleConnectResult = 'redirecting' | 'connected' | 'cancelled' | 'failed';

/** Google's consent screen lives on this host (GOOGLE.authUrl); anything else is refused, never opened. */
export function isGoogleConsentUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.host === new URL(GOOGLE.authUrl).host;
  } catch {
    return false;
  }
}

/** The read-only scopes for what's wanted (config, never a literal here). */
export function scopesFor(want: GoogleProduct[]): string[] {
  return want.map((w) => GOOGLE.scopes[w]);
}

type Deps = Pick<AccountActions, 'googleStart' | 'googleConnectCode'> & {
  assertCanConnect?: () => void;
  /** Web navigation (injected in tests). */
  navigate?: (url: string) => void;
  /** Injectable SDK loader; production keeps the native module lazy. */
  loadGoogle?: () => Promise<typeof import('@react-native-google-signin/google-signin')>;
};

export async function connectGoogle(want: GoogleProduct[], deps: Deps, scheduling = false): Promise<GoogleConnectResult> {
  deps.assertCanConnect?.();
  if (Platform.OS === 'web') {
    const { authUrl } = await deps.googleStart({ want, ...(scheduling ? { scheduling: true } : {}) });
    if (!isGoogleConsentUrl(authUrl)) return 'failed';
    (deps.navigate ?? ((url: string) => window.location.assign(url)))(authUrl);
    return 'redirecting';
  }

  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = await (deps.loadGoogle?.() ?? import('@react-native-google-signin/google-signin'));
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    offlineAccess: true,
    forceCodeForRefreshToken: true,
    scopes: [...scopesFor(want), ...(scheduling ? Object.values(SCHEDULING.scopes) : [])],
  });
  try {
    await GoogleSignin.signOut().catch(() => null);
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return 'cancelled';
    const code = response.data.serverAuthCode;
    if (!code) return 'failed';
    const result = await deps.googleConnectCode({ serverAuthCode: code, want });
    return result.status === 'connected' ? 'connected' : 'failed';
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return 'cancelled';
    return 'failed';
  } finally {
    // MEGA keeps no Google session on the phone: the server holds the (encrypted) grant.
    await GoogleSignin.signOut().catch(() => null);
  }
}
