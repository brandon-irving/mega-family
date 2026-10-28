// CONTRACT §4 `routines.*` (GD, v0.13). Stub until the GD backend: see docs/gates/GD.md.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { notBuiltYet } from './model/gdStub';
import { requireViewer } from './model/viewer';

export const today = query({
  ...pick(API.routines.today),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return null;
  },
});

export const get = query({
  ...pick(API.routines.get),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return null;
  },
});

export const check = mutation({
  ...pick(API.routines.check),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('routines.check');
  },
});

export const set = mutation({
  ...pick(API.routines.set),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('routines.set');
  },
});
