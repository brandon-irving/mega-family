import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { requireViewer, sameFamilyMember } from './model/viewer';
import { fail } from './model/errors';
import { briefFor, saveBrief } from './model/assistantBriefs';
import { clock } from './ports/clock';

export const forMember = query({
  ...pick(API.assistantBriefs.forMember),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const member = await sameFamilyMember(ctx, viewer.member.familyId, args.memberId);
    if (viewer.member.role !== 'admin' && !viewer.isParentOf.includes(member._id)) fail('FORBIDDEN');
    const row = await briefFor(ctx, member.familyId, member._id);
    if (!row) return null;
    if (row.creatorId !== viewer.member._id) fail('FORBIDDEN');
    return { proposed: row.proposed, status: row.status, helpRequested: !!row.helpRequested, canEdit: !member.authId || !!row.helpRequested };
  },
});

export const save = mutation({
  ...pick(API.assistantBriefs.save),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const member = await sameFamilyMember(ctx, viewer.member.familyId, args.memberId);
    if (viewer.member.role !== 'admin' && !viewer.isParentOf.includes(member._id)) fail('FORBIDDEN');
    await saveBrief(ctx, viewer.member, member, args.brief, await clock.now(ctx, member.familyId));
    return null;
  },
});
