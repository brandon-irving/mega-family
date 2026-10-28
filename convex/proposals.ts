// CONTRACT §4 `proposals.*` (GD, v0.13). Stub until the GD backend: see docs/gates/GD.md.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { notBuiltYet } from './model/gdStub';
import { requireViewer } from './model/viewer';

export const open = query({
  ...pick(API.proposals.open),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return [];
  },
});

export const get = query({
  ...pick(API.proposals.get),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return notBuiltYet('proposals.get');
  },
});

export const decide = mutation({
  ...pick(API.proposals.decide),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role !== 'admin') fail('FORBIDDEN');
    return notBuiltYet('proposals.decide');
  },
});
