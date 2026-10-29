// This phone's calendar, start to finish (boards PhoneCalendarPick / PhoneCalendarDenied): ask the phone's
// permission → list its calendars → the owner picks → `integrations.connectDevice` → read the picked calendars'
// events in the DEVICE_CALENDAR window → `integrations.syncDevice`. Shared by the onboarding `connect` card and
// Settings → Connected accounts. `now` is the family clock's (useFamilyNow), never the wall clock.
import { useCallback, useEffect, useRef, useState } from 'react';
import { G5_UI_COPY as U } from '@shared/config/copy';
import { DEVICE_CALENDAR } from '@shared/config/onboarding';
import type { Id } from '@shared/domain/validators';
import type { IntegrationView } from '@shared/domain/api';
import { useAccountActions, useIntegrations, type AccountActions } from '@/data/useAccounts';
import { useFamilyNow } from '@/data/useShopping';
import {
  listPhoneCalendars,
  loadPhonePicks,
  phoneCalendarSupported,
  readPhoneEvents,
  requestPhoneCalendarAccess,
  savePhonePicks,
  type PhoneCalendar,
} from '@/services/phoneCalendar';

export type PhoneStage = 'idle' | 'asking' | 'picking' | 'adding' | 'denied';

type Deps = Pick<AccountActions, 'connectDevice' | 'syncDevice'>;

/** Reads the picked calendars and syncs them up. Returns false when there's nothing to sync with. */
export async function syncPhone(integrationId: Id<'integrations'>, now: number, deps: Pick<AccountActions, 'syncDevice'>, picks?: string[]): Promise<boolean> {
  const calendarIds = picks ?? (await loadPhonePicks(integrationId));
  if (!calendarIds || calendarIds.length === 0) return false;
  const { windowStart, windowEnd, events } = await readPhoneEvents(calendarIds, now);
  await deps.syncDevice({ integrationId, windowStart, windowEnd, events });
  return true;
}

/** Whether the phone's calendar is due a sync (DEVICE_CALENDAR.syncEveryMinutes since the last one). */
export function phoneSyncDue(i: Pick<IntegrationView, 'kind' | 'status' | 'lastSyncAt'>, now: number): boolean {
  if (i.kind !== 'deviceCalendar' || (i.status ?? 'connected') !== 'connected') return false;
  return !i.lastSyncAt || now - i.lastSyncAt >= DEVICE_CALENDAR.syncEveryMinutes * 60_000;
}

/** On app open (PLAN: polling, the app syncs up on open): re-sync this phone's calendar when it's due. Once
 * per mount; quiet on failure (the next open tries again, and Settings shows "Couldn't check lately"). */
export function usePhoneAutoSync() {
  const list = useIntegrations();
  const now = useFamilyNow();
  const { syncDevice } = useAccountActions();
  const done = useRef(false);
  const due = list.status === 'ok' && now !== undefined ? list.data.find((i) => phoneSyncDue(i, now)) : undefined;
  useEffect(() => {
    if (!phoneCalendarSupported || done.current || !due || now === undefined) return;
    done.current = true;
    void syncPhone(due.integrationId, now, { syncDevice }).catch(() => null);
  }, [due, now, syncDevice]);
}

export function usePhoneCalendarFlow(deps: Deps, now: number | undefined, onConnected?: () => void) {
  const [stage, setStage] = useState<PhoneStage>('idle');
  const [calendars, setCalendars] = useState<PhoneCalendar[]>([]);
  const [picks, setPicks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (!phoneCalendarSupported) return;
    setError(null);
    setStage('asking');
    try {
      if ((await requestPhoneCalendarAccess()) !== 'granted') {
        setStage('denied');
        return;
      }
      const list = await listPhoneCalendars();
      setCalendars(list);
      setPicks(list.map((c) => c.id));
      setStage('picking');
    } catch {
      setError(U.phoneSyncFailed);
      setStage('idle');
    }
  }, []);

  const toggle = useCallback((id: string) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])), []);

  const add = useCallback(async () => {
    if (picks.length === 0 || now === undefined) return;
    setStage('adding');
    try {
      const integrationId = await deps.connectDevice({ label: U.phoneAccountLabel, calendarIds: picks });
      await savePhonePicks(integrationId, picks);
      await syncPhone(integrationId, now, deps, picks);
      setStage('idle');
      onConnected?.();
    } catch {
      setError(U.phoneSyncFailed);
      setStage('idle');
    }
  }, [deps, now, onConnected, picks]);

  const close = useCallback(() => setStage((s) => (s === 'picking' ? 'idle' : s)), []);

  return { supported: phoneCalendarSupported, stage, calendars, picks, error, start, toggle, add, close };
}
