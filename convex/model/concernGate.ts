// The server-side gate on every memory save (G2 security review BLOCKER). Independent of whatever the
// conversation model itself claims (a `remember` tool call's own args, or the memory writer's proposed
// `concernCategory`/`trigger`): `convex/agent/concernClassifier.ts` classifies the memory text on its own
// (seeing only the fact + who it's about, never the conversation), and this module turns that independent
// classification into the same `LearningOp` overrides both the `remember` tool (convex/agent/tools.ts) and
// the writer (convex/agent/writer.ts) apply before calling `decideLearning` — one place, not two copies.
import { CONCERN_CATEGORIES, CONCERN_KEYWORD_BACKSTOP, type ConcernCategory } from '../../shared/config/learning';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { LearningOp } from './learningPolicy';

export function isConcernCategory(v: unknown): v is ConcernCategory {
  return typeof v === 'string' && (CONCERN_CATEGORIES as readonly string[]).includes(v);
}

/** The category the keyword backstop forces, or `null` if nothing in the text matches. Case-insensitive
 * plain substring match (shared/config/learning.ts's docstring on why that's deliberately over-inclusive). */
export function keywordBackstopCategory(text: string): ConcernCategory | null {
  const lower = text.toLowerCase();
  for (const [category, words] of Object.entries(CONCERN_KEYWORD_BACKSTOP)) {
    if (words.some((w) => lower.includes(w))) return category as ConcernCategory;
  }
  return null;
}

/** Maps the classifier's category onto the pre-existing `LearningOp.concernCategory` union (which predates
 * this gate and uses camelCase / fewer cases). `'ok'` and `'web_content'` aren't represented here —
 * `'web_content'` is handled separately via `derivedFromWebSearch` (decideLearning already hard-drops that). */
function toLearningOpConcern(category: ConcernCategory): LearningOp['concernCategory'] | undefined {
  switch (category) {
    case 'health':
      return 'health';
    case 'feelings':
      return 'feelings';
    case 'school_trouble':
      return 'schoolTrouble';
    case 'kid_trait':
      return 'kidTrait';
    default:
      return undefined;
  }
}

/** Applies an independently-computed concern category to a `LearningOp` someone else built (from a
 * `remember` tool call's args, or a writer proposal), overriding whatever that source said about
 * `concernCategory`/`sensitive`/`derivedFromWebSearch` — this is the one and only place those three fields
 * are allowed to come from anything other than this gate, once a server classification exists. `'ok'`
 * passes `op` through unchanged (whatever `sensitive` flag the source set for ordinary, non-concerning
 * sensitivity — e.g. "mom's salary" — still applies). */
export function gateByServerConcern(op: LearningOp, category: ConcernCategory, decidedBy?: string): LearningOp {
  if (category === 'web_content') return { ...op, concernCategory: undefined, derivedFromWebSearch: true };
  const mapped = toLearningOpConcern(category);
  if (!mapped) return op; // 'ok'
  return { ...op, concernCategory: mapped, sensitive: true, derivedFromWebSearch: false, gate: decidedBy ? { decidedBy, reason: category } : op.gate };
}

/** GD (OpenDuet learning, "rules only tighten"): combines the classifier's verdict with the keyword
 * backstop. The rule may only ESCALATE an "ok" to a concern, never clear one the model flagged, and the
 * result records which of the two decided (`rule:keywordBackstop:<category>` or `model:<id>`). */
export function combineWithBackstop(modelCategory: ConcernCategory | null, backstop: ConcernCategory | null, modelId: string): { category: ConcernCategory; decidedBy: string } {
  if (modelCategory && modelCategory !== 'ok') return { category: modelCategory, decidedBy: `model:${modelId}` };
  if (backstop) return { category: backstop, decidedBy: `rule:keywordBackstop:${backstop}` };
  return modelCategory ? { category: 'ok', decidedBy: `model:${modelId}` } : { category: 'ok', decidedBy: 'rule:noClassifier' };
}

/** Logs a never-saved concerning fact to `familyEvents` (task brief rule (c): "otherwise dropped (and
 * logged to familyEvents)") so there's a record of what the gate caught, even though nothing was saved as
 * a memory. Only called for a drop that the concern gate itself caused (category !== 'ok'), not every
 * ordinary `decideLearning` drop (e.g. config-level "dropped by LEARNING_POLICY.byTrigger"). */
export async function logDroppedConcern(
  ctx: MutationCtx,
  params: { familyId: Id<'families'>; memberId: Id<'members'>; now: number },
  text: string,
  category: ConcernCategory,
  reason: string,
): Promise<void> {
  await ctx.db.insert('familyEvents', {
    familyId: params.familyId,
    at: params.now,
    type: 'said',
    payload: { droppedConcerningMemory: { text, category, reason, proposedBy: params.memberId } },
    processed: { memory: true, profiler: true, triggers: true },
  });
}
