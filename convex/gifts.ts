// CONTRACT §4 `gifts.*` (GD, v0.13). Stub until the GD backend: see docs/gates/GD.md.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { notBuiltYet } from './model/gdStub';
import { requireViewer } from './model/viewer';

export const upcoming = query({
  ...pick(API.gifts.upcoming),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return [];
  },
});

export const get = query({
  ...pick(API.gifts.get),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return notBuiltYet('gifts.get');
  },
});

export const generate = mutation({
  ...pick(API.gifts.generate),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return notBuiltYet('gifts.generate');
  },
});

export const addToList = mutation({
  ...pick(API.gifts.addToList),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return notBuiltYet('gifts.addToList');
  },
});
