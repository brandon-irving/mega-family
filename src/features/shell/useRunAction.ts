// One busy/error wrapper for a card's button taps: shows the button's spinner while the mutation runs and
// turns a server refusal into the friendly line from config (errorCopyFor) instead of an unhandled promise.
import { useCallback, useState } from 'react';
import { errorCopyFor } from '@/data/errorCopy';

export function useRunAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (id: string, fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(errorCopyFor(err));
      return false;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, error, run };
}
