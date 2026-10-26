// The one read path for memories by text relevance (PLAN.md → Global memory: "Every read goes through
// `memory.recall(ctx, viewer, query)`... There is no other read path"). Used by the agent's `recall` tool
// and by `agent/context.ts`'s per-turn search hits, so both go through exactly the same scope enforcement.
import type { Doc, Id } from '../_generated/dataModel';
import type { Role } from '../../shared/domain/enums';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { LIMITS } from '../../shared/config';
import { readableScopeKeys } from './memoryAccess';

type Ctx = QueryCtx | MutationCtx;

export interface RecallHit {
  memoryId: Id<'memories'>;
  text: string;
  kind: Doc<'memories'>['kind'];
}

/** Searches every scope key `memberId` (at `role`) may read, merging up to `limitPerScope` hits per key —
 * never a key outside `readableScopeKeys`, regardless of what a tool call or prompt injection asks for. */
export async function recall(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>, role: Role, query: string, limitPerScope = 5): Promise<RecallHit[]> {
  const keys = await readableScopeKeys(ctx, familyId, memberId, role);
  const out: RecallHit[] = [];
  for (const key of keys) {
    const rows = query.trim()
      ? await ctx.db
          .query('memories')
          .withSearchIndex('search_text', (q) => q.search('text', query).eq('familyId', familyId).eq('scopeKey', key))
          .take(limitPerScope)
      : await ctx.db
          .query('memories')
          .withIndex('by_family_scopeKey', (q) => q.eq('familyId', familyId).eq('scopeKey', key))
          .order('desc')
          .take(limitPerScope);
    out.push(...rows.map((r) => ({ memoryId: r._id, text: r.text, kind: r.kind })));
  }
  return out;
}

/** The family's pinned facts (PLAN.md's always-included context item 2), still scope-filtered. One bounded
 * `take` per readable scope key (same documented-limit pattern as `memories.list`'s merge path, convex/
 * memories.ts) rather than an unbounded collect over every memory the family has ever saved. */
export async function pinnedFacts(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>, role: Role): Promise<string[]> {
  const keys = await readableScopeKeys(ctx, familyId, memberId, role);
  const out: string[] = [];
  for (const key of keys) {
    const rows = await ctx.db
      .query('memories')
      .withIndex('by_family_scopeKey', (q) => q.eq('familyId', familyId).eq('scopeKey', key))
      .take(LIMITS.memories.mergeSearchCapPerScope);
    out.push(...rows.filter((r) => r.pinned).map((r) => r.text));
  }
  return out;
}
