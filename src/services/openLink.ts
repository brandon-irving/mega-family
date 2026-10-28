// Opens a web link (a search card's source) in the in-app browser: SFSafariViewController on iOS, a Chrome
// custom tab on Android, a new tab on web (expo-web-browser `openBrowserAsync`, SDK 58 docs). Search sources
// are untrusted data (docs/gates/G4.md invariant 1), so only plain http(s) URLs open; anything else
// (`javascript:`, `intent:`, a custom scheme) is refused rather than handed to the system.
import { openBrowserAsync } from 'expo-web-browser';

export function isOpenableUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** The bare host for a source row ("amnh.org"), or '' when the URL doesn't parse. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export async function openLink(url: string): Promise<boolean> {
  if (!isOpenableUrl(url)) return false;
  await openBrowserAsync(url);
  return true;
}
