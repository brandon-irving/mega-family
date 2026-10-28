// CONTRACT §4 `weather.*` (G4, v0.15). Stub until the G4 backend: see docs/gates/G4.md.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { requireViewer } from './model/viewer';

export const get = query({
  ...pick(API.weather.get),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return null; // stub: "no geocoded place yet"
  },
});

export const refresh = mutation({
  ...pick(API.weather.refresh),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return { queued: false }; // stub
  },
});
