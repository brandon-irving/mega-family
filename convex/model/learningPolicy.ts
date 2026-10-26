// `applyLearningPolicy`'s decision (PLAN.md → Learnings: "one function... looks the pair up in
// `learningPolicy` and decides"). Pure and ctx-free so every trigger × kind combination is a plain unit
// test (convex/agent/learningPolicy.test.ts) — the memory writer (convex/agent/writer.ts) is the only
// caller, and it's the one that turns a decision into actual `memories` rows / choice blocks.
import { LEARNING_POLICY } from '../../shared/config/learning';
import type { LearningTrigger, MemoryKind, Role, Scope } from '../../shared/domain/enums';
import type { Id } from '../_generated/dataModel';

/** What the writer proposed for one fact (PLAN.md: "trigger, kind and a suggested scope"). */
export interface LearningOp {
  trigger: LearningTrigger;
  kind: MemoryKind;
  text: string;
  suggestedScope: Scope;
  /** Required when `suggestedScope === 'shared'`: who the writer thinks this would help (PLAN.md's "Want
   * me to tell Coral you're running late?"). */
  shareWithMemberIds?: Id<'members'>[];
  confidence: number;
  sensitive: boolean;
  about: Id<'members'>[];
  /** Set only by the orchestrating code (never the model) when this turn's tool calls included a
   * `web_search` — a structural fact the loop controls, so a prompt-injected "remember this web result"
   * can't fake its way past the never-save rule. */
  derivedFromWebSearch?: boolean;
  /** Set by the writer only when it's proposing a guess/inference PLAN.md's learnings table marks "Never":
   * a guess about health, feelings or school trouble, or an inferred trait about a kid. */
  concernCategory?: 'health' | 'feelings' | 'schoolTrouble' | 'kidTrait';
}

export type LearningDecision =
  | { action: 'saveConfirmed'; scope: Scope; shareWithMemberIds?: Id<'members'>[] }
  | { action: 'saveUnconfirmed'; scope: Scope }
  | { action: 'queueForProfiler' }
  | { action: 'askBeforeSharing'; scope: Scope; shareWithMemberIds: Id<'members'>[] }
  | { action: 'drop'; reason: string };

/** The single decision point (PLAN.md → Learnings: "the policy is the single place that decides, so tuning
 * it is a config edit"). Hard never-save rules run first, in code, and can't be overridden by config or by
 * anything the model says — see PLAN.md's learnings table, row "Never". */
export function decideLearning(op: LearningOp, selfMemberId: Id<'members'>): LearningDecision {
  if (op.derivedFromWebSearch) return { action: 'drop', reason: 'never-save: web search results' };

  if (op.concernCategory) {
    const selfReportedExplicitly = op.trigger === 'explicit' && op.about.length === 1 && op.about[0] === selfMemberId;
    if (!selfReportedExplicitly) return { action: 'drop', reason: `never-save: ${op.concernCategory} guess/trait, not stated by the member themselves` };
  }

  // Sensitive facts stay personal and are never even proposed unconfirmed (PLAN.md: "Sensitive facts stay
  // personal unless the owner says otherwise" / "saved only when asked").
  if (op.sensitive && op.trigger !== 'explicit' && op.trigger !== 'correction') {
    return { action: 'drop', reason: 'never-save: sensitive guess, not explicitly stated' };
  }
  const scope: Scope = op.sensitive ? 'personal' : op.suggestedScope;

  const baseAction = LEARNING_POLICY.byTrigger[op.trigger];
  switch (baseAction) {
    case 'saveConfirmed':
      return { action: 'saveConfirmed', scope, shareWithMemberIds: scope === 'shared' ? op.shareWithMemberIds : undefined };
    case 'saveUnconfirmed':
      if (scope === 'shared') return { action: 'askBeforeSharing', scope, shareWithMemberIds: op.shareWithMemberIds ?? [] };
      if (op.confidence < LEARNING_POLICY.confidence.saveUnconfirmedMin) return { action: 'queueForProfiler' };
      return { action: 'saveUnconfirmed', scope };
    case 'queueForProfiler':
      return { action: 'queueForProfiler' };
    case 'askBeforeSharing':
      return { action: 'askBeforeSharing', scope, shareWithMemberIds: op.shareWithMemberIds ?? [] };
    case 'drop':
    default:
      return { action: 'drop', reason: 'config: dropped by LEARNING_POLICY.byTrigger' };
  }
}

/** The default scope for a kind, before any sensitive/shared override — exposed for the writer's prompt
 * (so Muse Spark is told the expected default) and for tests. */
export function defaultScopeFor(kind: MemoryKind): Scope {
  return LEARNING_POLICY.defaultScope[kind];
}

/** Kids never get an `adults`/`shared` learning written in their name by this policy — logistics stay at
 * `family`, everything else collapses to `personal`. A defensive second check: `decideLearning` already
 * only ever proposes what the writer suggested, so this guards against a writer call that (wrongly, or via
 * a prompt injection in the transcript it read) suggests an out-of-bounds scope for a kid's own memory. */
export function clampScopeForRole(scope: Scope, role: Role): Scope {
  if (role !== 'kid') return scope;
  if (scope === 'adults' || scope === 'shared') return 'personal';
  return scope;
}
