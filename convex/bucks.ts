// CONTRACT §4 `bucks.*` (GD, v0.13). Stub until the GD backend: see docs/gates/GD.md.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { notBuiltYet } from './model/gdStub';
import { requireViewer } from './model/viewer';

export const balance = query({
  ...pick(API.bucks.balance),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return { balance: 0 };
  },
});

export const history = query({
  ...pick(API.bucks.history),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return { page: [], isDone: true, continueCursor: '' };
  },
});

export const release = mutation({
  ...pick(API.bucks.release),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return notBuiltYet('bucks.release');
  },
});
