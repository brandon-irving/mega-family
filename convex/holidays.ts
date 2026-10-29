// CONTRACT §4 `holidays.*` (G4b, v0.16). Stub until the G4b backend: see docs/gates/G4b.md.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { notBuiltYet } from './model/g4bStub';
import { requireViewer } from './model/viewer';

export const upcoming = query({
  ...pick(API.holidays.upcoming),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return []; // stub
  },
});

export const question = query({
  ...pick(API.holidays.question),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('holidays.question');
  },
});

export const answer = mutation({
  ...pick(API.holidays.answer),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('holidays.answer');
  },
});
