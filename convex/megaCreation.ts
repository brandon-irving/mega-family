import { v } from 'convex/values';
import { API } from '../shared/domain/api';
import { pick } from './model/define';
import { activeDraft, updateDraft } from './model/megaCreation';
import { tryViewer } from './model/viewer';
import { query, mutation, internalMutation } from './_generated/server';
import { requireViewer } from './model/viewer';
import { getOrCreateOwnThread } from './model/threads';
import { executeCreationTool } from './model/creationTools';
import { clock } from './ports/clock';
import { CREATION_TOOLS, MCP_CONFIRM_TOOL } from './agent/creationToolSpecs';

/** MCP authentication is inherited from the HTTP action; never accepts a caller/member/family ID. */
export const execute = internalMutation({
  args: { name: v.string(), argumentsJson: v.string() }, returns: v.string(),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const spec = [...CREATION_TOOLS, MCP_CONFIRM_TOOL].find(tool => tool.name === args.name);
    if (!spec) throw new Error('Unknown creation tool.');
    const raw = JSON.parse(args.argumentsJson);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Arguments must be an object.');
    const allowed = Object.keys((spec.parameters as { properties: Record<string, unknown> }).properties);
    if (Object.keys(raw).some(key => !allowed.includes(key))) throw new Error('Unknown tool argument.');
    const now = await clock.now(ctx, viewer.member.familyId);
    const thread = await getOrCreateOwnThread(ctx, viewer.member.familyId, viewer.member._id, viewer.mega?._id ?? null, now);
    return JSON.stringify(await executeCreationTool(ctx, viewer.member, thread._id, args.name, raw, now));
  },
});

export const current = query({
  ...pick(API.megaCreation.current),
  handler: async ctx => {
    const viewer = await tryViewer(ctx);
    if (!viewer || viewer.member.role === 'kid') return null;
    const row = await activeDraft(ctx, viewer.member);
    return row && (row.status === 'draft' || row.status === 'review') ? { data: row.data, revision: row.revision, status: row.status } : null;
  },
});

export const personalize = mutation({
  ...pick(API.megaCreation.personalize),
  handler: async ctx => {
    const viewer = await requireViewer(ctx);
    const existing = await activeDraft(ctx, viewer.member);
    if (existing) return null; // Keep an existing conversation's draft intact.
    const now = await clock.now(ctx, viewer.member.familyId);
    const thread = await getOrCreateOwnThread(ctx, viewer.member.familyId, viewer.member._id, viewer.mega?._id ?? null, now);
    await updateDraft(ctx, viewer.member, thread._id, { target: 'self' }, now);
    return null;
  },
});
