// CONTRACT §4 `shareSuggestions.*` (GD, v0.13). Stub until the GD backend: see docs/gates/GD.md.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { notBuiltYet } from './model/gdStub';
import { requireViewer } from './model/viewer';

export const mine = query({
  ...pick(API.shareSuggestions.mine),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return [];
  },
});

export const get = query({
  ...pick(API.shareSuggestions.get),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('shareSuggestions.get');
  },
});

export const answer = mutation({
  ...pick(API.shareSuggestions.answer),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('shareSuggestions.answer');
  },
});
