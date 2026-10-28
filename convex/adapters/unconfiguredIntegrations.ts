// G4 contract placeholders for the REAL integration adapters (`MEGA_MODEL_ADAPTER=real`) until the G4 backend
// writes them (metaWebSearch.ts, openMeteoNwsWeather.ts, mapboxDirections.ts, mapboxGeocoder.ts). They fail
// closed — `not_configured`, never a fake value — so a live deployment can't show made-up weather or travel
// times (the hackathon rule: no mocks in the demo). The G4 backend replaces each in registry.ts and deletes this
// file; docs/gates/G4.md requires it gone at gate end.
import type { Directions } from '../ports/directions';
import type { Geocoder } from '../ports/geocoder';
import type { Weather } from '../ports/weather';
import type { WebSearch } from '../ports/webSearch';

const notConfigured = { ok: false as const, failure: 'not_configured' as const, detail: 'G4 adapter not built yet' };

export const unconfiguredWebSearch: WebSearch = { search: async () => notConfigured };
export const unconfiguredWeather: Weather = { forecast: async () => notConfigured, alerts: async () => notConfigured };
export const unconfiguredDirections: Directions = { travelTime: async () => notConfigured };
export const unconfiguredGeocoder: Geocoder = { geocode: async () => notConfigured };
