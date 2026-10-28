// CONTRACT §4 `chores.*` (GD, v0.13). Stub until the GD backend: see docs/gates/GD.md.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { notBuiltYet } from './model/gdStub';
import { requireViewer } from './model/viewer';

export const list = query({
  ...pick(API.chores.list),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return [];
  },
});

export const claim = query({
  ...pick(API.chores.claim),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('chores.claim');
  },
});

export const create = mutation({
  ...pick(API.chores.create),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return notBuiltYet('chores.create');
  },
});

export const update = mutation({
  ...pick(API.chores.update),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return notBuiltYet('chores.update');
  },
});

export const markDone = mutation({
  ...pick(API.chores.markDone),
  handler: async (ctx) => {
    await requireViewer(ctx);
    return notBuiltYet('chores.markDone');
  },
});

export const decline = mutation({
  ...pick(API.chores.decline),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return notBuiltYet('chores.decline');
  },
});
