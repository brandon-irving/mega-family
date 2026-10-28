// CONTRACT §4 `practice.*` (GD, v0.13). Stub until the GD backend: see docs/gates/GD.md.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { notBuiltYet } from './model/gdStub';
import { requireViewer } from './model/viewer';

export const get = query({
  ...pick(API.practice.get),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('practice.get');
  },
});

export const answer = mutation({
  ...pick(API.practice.answer),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('practice.answer');
  },
});

export const hint = mutation({
  ...pick(API.practice.hint),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('practice.hint');
  },
});
