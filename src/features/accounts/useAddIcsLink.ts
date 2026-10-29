// "Add link" for a school or team schedule link, shared by the onboarding card and Settings → Connected
// accounts (G5 UX review, Oct 29). The busy state is the field's own, so Not now and the sheet's Close keep
// working while a link is being added. The app stops waiting after APP_TIMEOUTS.icsAddMs and says it couldn't
// reach the link; the server may still finish, and then the live integrations list shows it. Each failure has
// its own line: a mistyped link, one that couldn't be reached, one with no calendar in it.
import { useCallback, useState } from 'react';
import { APP_TIMEOUTS } from '@shared/config/appTimeouts';
import { G5_COPY, G5_FIX_COPY } from '@shared/config/copy';
import { looksLikeFeedUrl } from './feedUrl';

export type IcsAddResult = { integrationId?: string; label?: string; events: number; failure?: string };
type AddIcs = (args: { url: string }) => Promise<IcsAddResult>;

/** The line under the field for a failure the server reported (or the app's own timeout). */
export function icsFailureCopy(failure: string): string {
  switch (failure) {
    case 'invalid':
      return G5_COPY.icsBad;
    case 'no_result':
      return G5_FIX_COPY.icsNotCalendar;
    case 'unreachable':
    case 'timeout':
    case 'error':
      return G5_FIX_COPY.icsUnreachable;
    default:
      return G5_FIX_COPY.icsCouldntAdd;
  }
}

const TIMED_OUT = Symbol('timedOut');

export function useAddIcsLink(addIcs: AddIcs) {
  const [text, setTextState] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setText = useCallback((t: string) => {
    setTextState(t);
    setError(null);
  }, []);

  /** Adds the link in the field; resolves to the added link, or null (the error line says why). */
  const submit = useCallback(async (): Promise<(IcsAddResult & { integrationId: string }) | null> => {
    const url = text.trim();
    if (!looksLikeFeedUrl(url)) {
      setError(G5_COPY.icsBad);
      return null;
    }
    setBusy(true);
    setError(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), APP_TIMEOUTS.icsAddMs);
      });
      const r = await Promise.race([addIcs({ url }), timeout]);
      if (r === TIMED_OUT) {
        setError(icsFailureCopy('timeout'));
        return null;
      }
      if (r.failure || !r.integrationId) {
        setError(icsFailureCopy(r.failure ?? 'unknown'));
        return null;
      }
      setTextState('');
      return r as IcsAddResult & { integrationId: string };
    } catch {
      setError(G5_FIX_COPY.icsCouldntAdd);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      setBusy(false);
    }
  }, [addIcs, text]);

  return { text, setText, error, setError, busy, submit };
}
