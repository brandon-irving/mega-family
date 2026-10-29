// The Holidays port (CONTRACT §8, G4b v0.16): public holidays for a country and year.
//
// Nager.Date v3 (date.nager.at/API, Oct 28): GET https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}
// (no key) → [{ date: "YYYY-MM-DD", localName, name, countryCode, fixed, global, counties: string[] | null,
// launchYear, types: ("Public" | "Bank" | "School" | "Authorities" | "Optional" | "Observance")[] }]. Probed for
// 2026/US: Veterans Day 2026-11-11 (global, Public+Bank), Thanksgiving 11-26, Christmas 12-25; Columbus Day is
// regional for Public. A country it doesn't know is an HTTP 404 → `no_result`.
import type { Holiday } from '../../shared/domain/integrationShapes';
import type { IntegrationResult } from './integrationResult';

export type HolidayList = IntegrationResult<{ holidays: Holiday[] }>;

export interface Holidays {
  list(request: { year: number; country: string }): Promise<HolidayList>;
}
