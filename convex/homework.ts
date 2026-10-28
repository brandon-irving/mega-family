// CONTRACT §4 `homework.*` (GD, v0.13). Stub until the GD backend: see docs/gates/GD.md.
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { notBuiltYet } from './model/gdStub';
import { requireViewer } from './model/viewer';

export const submit = mutation({
  ...pick(API.homework.submit),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return notBuiltYet('homework.submit');
  },
});

export const sheet = query({
  ...pick(API.homework.sheet),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return notBuiltYet('homework.sheet');
  },
});

export const makePractice = mutation({
  ...pick(API.homework.makePractice),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN');
    return notBuiltYet('homework.makePractice');
  },
});
