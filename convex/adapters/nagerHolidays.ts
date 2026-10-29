// The real Holidays adapter: Nager.Date v3. Docs read Oct 28 (date.nager.at/API): GET {baseUrl}/PublicHolidays/
// {year}/{countryCode}, no key → [{ date, localName, name, countryCode, fixed, global, counties, launchYear,
// types }]; an unknown country is HTTP 404 (→ `no_result`). Probed 2026/US Oct 28. The only file that knows its JSON.
import { HOLIDAYS } from '../../shared/config/shopping';
import type { Holiday } from '../../shared/domain/integrationShapes';
import type { HolidayList, Holidays } from '../ports/holidays';
import { fetchJson } from './httpFetch';

export function holidaysUrl(year: number, country: string): string {
  return `${HOLIDAYS.baseUrl}/PublicHolidays/${encodeURIComponent(String(year))}/${encodeURIComponent(country.toUpperCase())}`;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export function parseHolidays(json: unknown): HolidayList {
  if (!Array.isArray(json)) return { ok: false, failure: 'no_result', detail: 'not a list' };
  const holidays: Holiday[] = json.flatMap((h: Record<string, unknown>) => {
    const date = str(h?.date);
    const name = str(h?.name);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) return [];
    const regions = Array.isArray(h.counties) ? (h.counties as unknown[]).flatMap((c) => (str(c) ? [str(c)!] : [])) : undefined;
    const types = Array.isArray(h.types) ? (h.types as unknown[]).flatMap((t) => (str(t) ? [str(t)!] : [])) : [];
    return [{ date, name, localName: str(h.localName) ?? name, global: h.global === true, ...(regions?.length ? { regions } : {}), types }];
  });
  return { ok: true, holidays };
}

export const nagerHolidays: Holidays = {
  async list({ year, country }) {
    const res = await fetchJson(holidaysUrl(year, country), { method: 'GET', headers: { Accept: 'application/json' } }, HOLIDAYS.timeoutMs);
    if (!res.ok) return { ok: false, failure: res.status === 404 ? 'no_result' : res.failure, detail: res.detail };
    return parseHolidays(res.json);
  },
};
