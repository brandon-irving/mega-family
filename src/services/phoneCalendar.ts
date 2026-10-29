// G5 (CONTRACT v0.17): this phone's calendar through expo-calendar (installed, SDK 58; native packages are
// frozen). SDK 58 replaced the old API: `requestCalendarPermissionsAsync` / `getCalendarsAsync` /
// `getEventsAsync` are deprecated and THROW at runtime, so only `requestCalendarPermissions`,
// `getCalendars(EntityTypes.EVENT)` and `listEvents(calendars, start, end)` are used here
// (docs.expo.dev/versions/v58.0.0/sdk/calendar). iOS and Android only: on web the cards say to open MEGA on the
// phone. The app reads events and syncs them up (`integrations.syncDevice`); the server never reaches the phone.
import { Linking, Platform } from 'react-native';
import { DEVICE_CALENDAR } from '@shared/config/onboarding';
import type { DeviceEventInput } from '@shared/domain/api';

export const phoneCalendarSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export type PhoneCalendar = { id: string; label: string; source: string; color?: string };
export type PhoneAccess = 'granted' | 'denied';

export async function requestPhoneCalendarAccess(): Promise<PhoneAccess> {
  const Calendar = await import('expo-calendar');
  const { status } = await Calendar.requestCalendarPermissions();
  return status === 'granted' ? 'granted' : 'denied';
}

export async function listPhoneCalendars(): Promise<PhoneCalendar[]> {
  const Calendar = await import('expo-calendar');
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return calendars.map((c) => ({ id: c.id, label: c.title, source: c.source?.name ?? '', color: c.color }));
}

/** The DEVICE_CALENDAR window around `now` (the family clock's now). */
export function syncWindow(now: number): { windowStart: number; windowEnd: number } {
  const day = 24 * 60 * 60 * 1000;
  return { windowStart: now - DEVICE_CALENDAR.pastDays * day, windowEnd: now + DEVICE_CALENDAR.futureDays * day };
}

type RawEvent = { id: string; calendarId: string; title?: string | null; startDate: string | Date; endDate?: string | Date | null; allDay?: boolean; location?: string | null };

const ms = (d: string | Date) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const localDate = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** expo-calendar events → the contract's `DeviceEventInput`. A repeating event's occurrences share one id on
 * iOS, so the occurrence's start is part of `externalId`. Untitled and unparseable events are skipped; at most
 * `DEVICE_CALENDAR.maxEventsPerSync`, soonest first. */
export function toDeviceEvents(events: RawEvent[]): DeviceEventInput[] {
  const out: DeviceEventInput[] = [];
  for (const e of events) {
    const start = ms(e.startDate);
    if (!Number.isFinite(start)) continue;
    const end = e.endDate ? ms(e.endDate) : undefined;
    out.push({
      externalId: `${e.id}@${start}`,
      calendarId: e.calendarId,
      title: (e.title ?? '').trim() || 'Busy',
      start,
      ...(end !== undefined && Number.isFinite(end) ? { end } : {}),
      ...(e.allDay ? { allDay: localDate(start) } : {}),
      ...(e.location ? { location: e.location } : {}),
    });
  }
  return out.sort((a, b) => a.start - b.start).slice(0, DEVICE_CALENDAR.maxEventsPerSync);
}

export async function readPhoneEvents(calendarIds: string[], now: number): Promise<{ windowStart: number; windowEnd: number; events: DeviceEventInput[] }> {
  const Calendar = await import('expo-calendar');
  const window = syncWindow(now);
  const events = calendarIds.length ? await Calendar.listEvents(calendarIds, new Date(window.windowStart), new Date(window.windowEnd)) : [];
  return { ...window, events: toDeviceEvents(events as unknown as RawEvent[]) };
}

/** Which phone calendars the owner picked, kept on the phone (the server keeps them too, but never returns an
 * integration's `config` to the app). Calendar ids aren't secrets; SecureStore is just the installed key-value
 * store. A lost value means the next sync asks to choose again. */
const picksKey = (integrationId: string) => `mega.phoneCalendars.${integrationId}`;

export async function savePhonePicks(integrationId: string, calendarIds: string[]): Promise<void> {
  const SecureStore = await import('expo-secure-store');
  await SecureStore.setItemAsync(picksKey(integrationId), JSON.stringify(calendarIds));
}

export async function loadPhonePicks(integrationId: string): Promise<string[] | null> {
  try {
    const SecureStore = await import('expo-secure-store');
    const raw = await SecureStore.getItemAsync(picksKey(integrationId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

/** The phone's Settings page for MEGA (PhoneCalendarDenied → Open Settings). */
export function openPhoneSettings(): Promise<void> {
  return Linking.openSettings();
}
