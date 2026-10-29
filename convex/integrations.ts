// CONTRACT §4 `integrations.*` (G5, v0.17): connected accounts (Gmail, Google Calendar, this phone's calendar,
// schedule links). Stub until the G5 backend: see docs/gates/G5.md. Owner-only everywhere; tokens never leave
// `integrationSecrets`.
import { v } from 'convex/values';
import { API } from '../shared/domain/api';
import { action, internalQuery, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { pick } from './model/define';
import { notBuiltYet } from './model/g5Stub';
import { requireViewer } from './model/viewer';

export const list = query({
  ...pick(API.integrations.list),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return []; // stub
  },
});

export const offer = query({
  ...pick(API.integrations.offer),
  handler: async (ctx, { offer }) => {
    await requireViewer(ctx);
    return { offer, state: 'offered' as const, integrations: [], available: { google: false } }; // stub
  },
});

export const googleStart = mutation({
  ...pick(API.integrations.googleStart),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('integrations.googleStart');
  },
});

/** Actions can't read the db: they check the caller through this query first. */
export const requireMemberCheck = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return null;
  },
});

export const googleConnectCode = action({
  ...pick(API.integrations.googleConnectCode),
  handler: async (ctx) => {
    await ctx.runQuery(internal.integrations.requireMemberCheck, {});
    return notBuiltYet('integrations.googleConnectCode');
  },
});

export const connectDevice = mutation({
  ...pick(API.integrations.connectDevice),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('integrations.connectDevice');
  },
});

export const syncDevice = mutation({
  ...pick(API.integrations.syncDevice),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('integrations.syncDevice');
  },
});

export const addIcs = action({
  ...pick(API.integrations.addIcs),
  handler: async (ctx) => {
    await ctx.runQuery(internal.integrations.requireMemberCheck, {});
    return notBuiltYet('integrations.addIcs');
  },
});

export const disconnect = action({
  ...pick(API.integrations.disconnect),
  handler: async (ctx) => {
    await ctx.runQuery(internal.integrations.requireMemberCheck, {});
    return notBuiltYet('integrations.disconnect');
  },
});

export const syncNow = action({
  ...pick(API.integrations.syncNow),
  handler: async (ctx) => {
    await ctx.runQuery(internal.integrations.requireMemberCheck, {});
    return notBuiltYet('integrations.syncNow');
  },
});
