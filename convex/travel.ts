// CONTRACT §4 `travel.*` (G4, v0.15). Stub until the G4 backend: see docs/gates/G4.md.
import { API } from '../shared/domain/api';
import { query } from './_generated/server';
import { pick } from './model/define';
import { requireViewer } from './model/viewer';

export const forEvent = query({
  ...pick(API.travel.forEvent),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return null; // stub: "no check has run yet"; the real one re-checks event visibility first
  },
});
