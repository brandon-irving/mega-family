// CONTRACT §4 "MEGA profile, memory and learnings": `memories.list` / `.forget` / `.changeScope`.
// PLAN.md → Global memory: "enforced in queries, never only in prompts" — every read goes through
// `readableScopeKeys`, the one function that decides which scope keys a member may see.
import type { Doc } from './_generated/dataModel';
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { canModifyMemory, readableScopeKeys } from './model/memoryAccess';
import { parseScopeKey, scopeKey } from './model/scopes';
import { requireViewer } from './model/viewer';

async function allPersonalKeys(ctx: Parameters<typeof requireViewer>[0], familyId: Doc<'families'>['_id']) {
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', familyId))
    .collect();
  return members.map((m) => scopeKey(familyId, { scope: 'personal', memberId: m._id }));
}

async function allSharedKeys(ctx: Parameters<typeof requireViewer>[0], familyId: Doc<'families'>['_id']) {
  const grants = await ctx.db
    .query('grants')
    .withIndex('by_family_owner', (q) => q.eq('familyId', familyId))
    .collect();
  return grants.map((g) => scopeKey(familyId, { scope: 'shared', grantId: g._id }));
}

async function everyScopeKey(ctx: Parameters<typeof requireViewer>[0], familyId: Doc<'families'>['_id']) {
  return [scopeKey(familyId, { scope: 'family' }), scopeKey(familyId, { scope: 'adults' }), ...(await allPersonalKeys(ctx, familyId)), ...(await allSharedKeys(ctx, familyId))];
}

export const list = query({
  ...pick(API.memories.list),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const familyId = viewer.member.familyId;
    const isAdmin = viewer.member.role === 'admin';

    // `keys === null` means "every scope key in the family" (admin, no scope filter): a true indexed
    // paginate over the familyId prefix, no merging needed.
    let keys: string[] | null;
    if (isAdmin && !args.scope) {
      keys = null;
    } else if (args.scope) {
      if (isAdmin) {
        keys = args.scope === 'personal' ? await allPersonalKeys(ctx, familyId) : args.scope === 'shared' ? await allSharedKeys(ctx, familyId) : [scopeKey(familyId, { scope: args.scope })];
      } else {
        const readable = await readableScopeKeys(ctx, familyId, viewer.member._id, viewer.member.role);
        keys = readable.filter((k) => parseScopeKey(familyId, k) === args.scope);
        if (keys.length === 0) fail('FORBIDDEN');
      }
    } else {
      keys = await readableScopeKeys(ctx, familyId, viewer.member._id, viewer.member.role);
    }

    if (!args.search) {
      if (keys === null) {
        return ctx.db
          .query('memories')
          .withIndex('by_family_scopeKey', (q) => q.eq('familyId', familyId))
          .order('desc')
          .paginate(args.paginationOpts);
      }
      if (keys.length === 1) {
        return ctx.db
          .query('memories')
          .withIndex('by_family_scopeKey', (q) => q.eq('familyId', familyId).eq('scopeKey', keys![0]))
          .order('desc')
          .paginate(args.paginationOpts);
      }
    }

    // Merge path: more than one scope key and/or a text search. Convex search takes one exact filter value
    // per call (PLAN.md → Global memory), so this runs one bounded `take` per key and merges in memory —
    // correct for a family's small memory set, but not a true cursor-paginated search (documented limit).
    const take = Math.min(args.paginationOpts.numItems, 200);
    const searchKeys = keys ?? (await everyScopeKey(ctx, familyId));
    let rows: Doc<'memories'>[] = [];
    for (const key of searchKeys) {
      rows.push(
        ...(args.search
          ? await ctx.db
              .query('memories')
              .withSearchIndex('search_text', (q) => q.search('text', args.search!).eq('familyId', familyId).eq('scopeKey', key))
              .take(take)
          : await ctx.db
              .query('memories')
              .withIndex('by_family_scopeKey', (q) => q.eq('familyId', familyId).eq('scopeKey', key))
              .order('desc')
              .take(take)),
      );
    }
    const seen = new Set<string>();
    rows = rows.filter((r) => (seen.has(r._id) ? false : (seen.add(r._id), true)));
    rows.sort((a, b) => b._creationTime - a._creationTime);
    return { page: rows.slice(0, take), isDone: true, continueCursor: '' };
  },
});

export const forget = mutation({
  ...pick(API.memories.forget),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (!(await canModifyMemory(ctx, memory, { familyId: viewer.member.familyId, memberId: viewer.member._id, role: viewer.member.role }))) fail('FORBIDDEN');
    await ctx.db.delete(memory._id);
    return null;
  },
});

export const changeScope = mutation({
  ...pick(API.memories.changeScope),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (!(await canModifyMemory(ctx, memory, { familyId: viewer.member.familyId, memberId: viewer.member._id, role: viewer.member.role }))) fail('FORBIDDEN');

    let key: string;
    if (args.scope === 'shared') {
      if (!args.granteeIds?.length) fail('VALIDATION', 'shared scope needs at least one grantee');
      const grantId = await ctx.db.insert('grants', { familyId: viewer.member.familyId, ownerId: viewer.member._id, granteeIds: args.granteeIds, label: memory.text.slice(0, 60) });
      key = scopeKey(viewer.member.familyId, { scope: 'shared', grantId });
    } else if (args.scope === 'personal') {
      key = scopeKey(viewer.member.familyId, { scope: 'personal', memberId: viewer.member._id });
    } else {
      key = scopeKey(viewer.member.familyId, { scope: args.scope });
    }
    await ctx.db.patch(memory._id, { scope: args.scope, scopeKey: key });
    return null;
  },
});
