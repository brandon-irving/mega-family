// CONTRACT §4 `search.*` (G4, v0.15). Stub until the G4 backend: see docs/gates/G4.md.
import { API } from '../shared/domain/api';
import { query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireViewer } from './model/viewer';

export const log = query({
  ...pick(API.search.log),
  handler: async (ctx, { memberId }) => {
    const viewer = await requireViewer(ctx);
    // Another member's log: only a parent of that kid (the real one also checks tellsParents.blockedSearches).
    if (memberId && memberId !== viewer.member._id && !viewer.isParentOf.includes(memberId)) fail('FORBIDDEN');
    return { page: [], isDone: true, continueCursor: '' };
  },
});
