// CONTRACT §4 `places.*` (G4, v0.15). Stub until the G4 backend: see docs/gates/G4.md.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { notBuiltYet } from './model/g4Stub';
import { requireNotKid, requireViewer } from './model/viewer';

export const list = query({
  ...pick(API.places.list),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return [];
  },
});

export const upsert = mutation({
  ...pick(API.places.upsert),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    requireNotKid(viewer.member.role);
    return notBuiltYet('places.upsert');
  },
});

export const remove = mutation({
  ...pick(API.places.remove),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    requireNotKid(viewer.member.role);
    return notBuiltYet('places.remove');
  },
});
