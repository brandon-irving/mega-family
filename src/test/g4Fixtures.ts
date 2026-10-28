// G4 (CONTRACT v0.15) fixtures for the Screen 14 views, shaped exactly like the contract's card and view models.
// Synthetic only: sample labels (Admin, Partner, Twin 1; MEGAs Teal, Zap) and public landmarks.
import type { Card } from '@shared/domain/messages';
import type { PlaceDoc, SearchLogRow } from '@/features/integrations/types';

const id = <T,>(s: string) => s as unknown as T;
export const TZ = 'America/New_York';
/** Thu Oct 29 2026, 2:00 PM New York. */
export const T0 = Date.UTC(2026, 9, 29, 18, 0);
const H = 60 * 60 * 1000;

export const SEARCH_ADULT: Extract<Card, { kind: 'search' }> = {
  kind: 'search',
  query: 'What time does the natural history museum open Saturday?',
  answer: 'The American Museum of Natural History opens at 10:00 AM on Saturday and closes at 5:30 PM.',
  sources: [
    { title: 'Hours and admission', url: 'https://www.amnh.org/plan-your-visit' },
    { title: 'Plan your visit · weekend tips', url: 'https://nyctourism.com/museums' },
  ],
  outcome: 'answered',
};

export const SEARCH_KID_REPHRASED: Extract<Card, { kind: 'search' }> = {
  kind: 'search',
  query: 'What’s the scariest animal attack ever?',
  answer: 'Mosquitoes are actually the most dangerous animals, because they spread sickness.',
  sources: [{ title: 'Dangerous animals', url: 'https://kids.nationalgeographic.com/animals' }],
  outcome: 'rephrased',
  rephrasedTo: 'Which animals are the most dangerous, for kids',
};

export const SEARCH_KID_BLOCKED: Extract<Card, { kind: 'search' }> = {
  kind: 'search',
  query: '[a search a kid shouldn’t do]',
  answer: 'I can’t look that up. Ask a grown-up.',
  sources: [],
  outcome: 'blocked',
};

export const WEATHER: Extract<Card, { kind: 'weather' }> = {
  kind: 'weather',
  summary: 'Cloudy, rain later',
  at: T0,
  placeLabel: 'Home',
  hours: [
    { at: T0, tempF: 63, precipPct: 0, code: 0 },
    { at: T0 + H, tempF: 62, precipPct: 10, code: 3 },
    { at: T0 + 2 * H, tempF: 61, precipPct: 30, code: 3 },
    { at: T0 + 3 * H, tempF: 59, precipPct: 70, code: 61 },
    { at: T0 + 4 * H, tempF: 58, precipPct: 80, code: 63 },
    { at: T0 + 5 * H, tempF: 57, precipPct: 80, code: 63 },
  ],
  highF: 64,
  lowF: 52,
};

export const WEATHER_ALERT: Extract<Card, { kind: 'weather' }> = {
  ...WEATHER,
  summary: 'Cloudy, storms later',
  alert: { event: 'Severe Thunderstorm Warning', headline: 'Damaging winds and hail possible near the soccer field.', severity: 'Severe', ends: T0 + 4 * H + 15 * 60 * 1000 },
};

export const TRAVEL_OK: Extract<Card, { kind: 'travel' }> = {
  kind: 'travel',
  to: 'Riverside Park Field',
  fromLabel: 'Home',
  leaveBy: Date.UTC(2026, 9, 29, 20, 50),
  minutes: 18,
  typicalMinutes: 14,
};

export const TRAVEL_NOT_SET_UP: Extract<Card, { kind: 'travel' }> = { kind: 'travel', to: 'Riverside Park Field', leaveBy: 0, minutes: 0, failure: 'not_configured' };

const place = (key: string, kind: PlaceDoc['kind'], label: string, address: string, status: PlaceDoc['geocode']['status']): PlaceDoc => ({
  _id: id(`pl_${key}`),
  _creationTime: 0,
  familyId: id('f'),
  kind,
  label,
  address,
  geocode: { status },
  createdBy: id('m_admin'),
  updatedAt: 0,
});

export const PLACES_FIXTURE: PlaceDoc[] = [
  place('home', 'home', 'Home', '1 Main St (sample)', 'seed'),
  place('school', 'school', 'School', '200 Central Park West, New York', 'ok'),
  place('work', 'work', 'Partner’s work', '11 W 53rd St, New York', 'ok'),
  place('park', 'other', 'Riverside Park Field', 'Riverside Dr & W 102nd St, New York', 'failed'),
];

const logRow = (key: string, row: Partial<SearchLogRow>): SearchLogRow => ({
  _id: id(`sl_${key}`),
  _creationTime: 0,
  familyId: id('f'),
  memberId: id('m_twin1'),
  at: T0,
  query: '',
  outcome: 'blocked',
  sourceCount: 0,
  ...row,
});

export const SEARCH_LOG_FIXTURE: SearchLogRow[] = [
  logRow('1', { query: 'a search a kid shouldn’t do', outcome: 'blocked', at: T0 }),
  logRow('2', { query: 'What’s the scariest animal attack ever?', outcome: 'rephrased', rephrasedTo: 'Which animals are the most dangerous, for kids', at: T0 - 20 * H, sourceCount: 1 }),
];
