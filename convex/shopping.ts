// CONTRACT §4 `shopping.*` (G4b, v0.16). Stub until the G4b backend: see docs/gates/G4b.md.
import { API } from '../shared/domain/api';
import { action, mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { notBuiltYet } from './model/g4bStub';
import { requireViewer } from './model/viewer';

export const products = action({
  ...pick(API.shopping.products),
  handler: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity())) fail('UNAUTHENTICATED');
    return { products: [], failure: 'not_configured' as const }; // stub: the catalog isn't wired yet
  },
});

export const watches = query({
  ...pick(API.shopping.watches),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return []; // stub
  },
});

export const watch = query({
  ...pick(API.shopping.watch),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('shopping.watch');
  },
});

export const unwatch = mutation({
  ...pick(API.shopping.unwatch),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('shopping.unwatch');
  },
});
