// Internal entry points for the spend guard (convex/model/spend.ts). Actions (the agent loop, the memory
// writer, talk.transcribe) can't touch `ctx.db` directly, so they call these through `ctx.runMutation`.
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import * as Spend from './model/spend';

export const requireBudget = internalMutation({
  args: { familyId: v.id('families'), estimatedCents: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await Spend.requireBudget(ctx, args.familyId, args.estimatedCents);
    return null;
  },
});

export const recordUsage = internalMutation({
  args: {
    familyId: v.id('families'),
    tokensIn: v.optional(v.number()),
    tokensOut: v.optional(v.number()),
    searches: v.optional(v.number()),
    images: v.optional(v.number()),
    cents: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await Spend.recordUsage(ctx, args.familyId, args);
    return null;
  },
});
