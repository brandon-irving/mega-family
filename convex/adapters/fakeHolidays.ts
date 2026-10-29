// A scripted Holidays for tests and the safe default outside `MEGA_MODEL_ADAPTER=real`. Default: the 2026 US
// holidays the demo uses (real public dates, from Nager.Date on Oct 28), none for other years or countries.
import type { Holiday } from '../../shared/domain/integrationShapes';
import type { HolidayList, Holidays } from '../ports/holidays';

const US_2026: Holiday[] = [
  { date: '2026-11-11', name: 'Veterans Day', localName: 'Veterans Day', global: true, types: ['Public', 'Bank'] },
  { date: '2026-11-26', name: 'Thanksgiving Day', localName: 'Thanksgiving Day', global: true, types: ['Public', 'Bank'] },
  { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true, types: ['Public', 'Bank'] },
];

export function makeFakeHolidays(script?: (request: { year: number; country: string }) => HolidayList): Holidays & { requests: { year: number; country: string }[] } {
  const requests: { year: number; country: string }[] = [];
  return {
    requests,
    async list(request) {
      requests.push(request);
      if (script) return script(request);
      return { ok: true, holidays: request.year === 2026 && request.country === 'US' ? US_2026 : [] };
    },
  };
}

export const defaultFakeHolidays: Holidays = makeFakeHolidays();
