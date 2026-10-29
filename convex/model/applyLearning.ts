// Turns a `decideLearning` decision (convex/model/learningPolicy.ts) into actual rows: a `memories` insert
// (+ supersede), a `grants` row for a fresh share, or a "confirm" choice block in the member's own thread
// (PLAN.md → Learnings: "each save adds a small chip", "the MEGA drops a choice block"). The one function
// both the `remember` tool (convex/agent/tools.ts) and the automatic memory writer (convex/agent/writer.ts)
// call, so a save looks the same whether the member asked for it mid-conversation or the writer inferred it.
import type { Scope } from '../../shared/domain/enums';
import type { UIBlock } from '../../shared/domain/messages';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { LearningDecision, LearningOp } from './learningPolicy';
import { clampScopeForRole } from './learningPolicy';
import { scopeKey } from './scopes';

export interface ApplyLearningParams {
  familyId: Id<'families'>;
  memberId: Id<'members'>;
  role: Doc<'members'>['role'];
  megaId: Id<'megas'> | null;
  /** The member's own thread, for an "ask before sharing" block. `null` when there's nowhere to ask (e.g.
   * a toddler's care-MEGA learning) — the share is just dropped rather than saved without asking. */
  threadId: Id<'threads'> | null;
  now: number;
}

export interface ApplyLearningResult {
  memoryId?: Id<'memories'>;
  chip?: { memoryId: Id<'memories'>; scope: Scope; label: string };
  choiceBlockMessageId?: Id<'messages'>;
  summary: string;
}

const SCOPE_LABEL: Record<Scope, string> = { family: 'Family', adults: 'Adults', personal: 'Personal', shared: 'Shared' };

async function resolveScopeKey(ctx: MutationCtx, familyId: Id<'families'>, memberId: Id<'members'>, scope: Scope, shareWithMemberIds: Id<'members'>[] | undefined, label: string): Promise<string> {
  if (scope === 'personal') return scopeKey(familyId, { scope: 'personal', memberId });
  if (scope === 'family' || scope === 'adults') return scopeKey(familyId, { scope });
  if (!shareWithMemberIds?.length) throw new Error('shared scope needs at least one member to share with');
  const grantId = await ctx.db.insert('grants', { familyId, ownerId: memberId, granteeIds: shareWithMemberIds, label: label.slice(0, 60) });
  return scopeKey(familyId, { scope: 'shared', grantId });
}

async function namesFor(ctx: MutationCtx, memberIds: Id<'members'>[]): Promise<string[]> {
  const names: string[] = [];
  for (const id of memberIds) {
    const m = await ctx.db.get(id);
    if (m) names.push(m.name);
  }
  return names;
}

export async function applyLearningDecision(
  ctx: MutationCtx,
  params: ApplyLearningParams,
  op: LearningOp,
  decision: LearningDecision,
  supersedes?: Id<'memories'>,
): Promise<ApplyLearningResult> {
  switch (decision.action) {
    case 'drop':
      return { summary: `not saved (${decision.reason})` };

    case 'queueForProfiler':
      // The nightly profiler job that would turn this into a confirmed profile update / check question is
      // a later gate (PLAN.md schedule, day 5). For now it's logged as a family event so that job has
      // something to read once it exists — a documented gap, not silently dropped.
      await ctx.db.insert('familyEvents', {
        familyId: params.familyId,
        at: params.now,
        type: 'said',
        payload: { queuedLearning: op, actorId: params.memberId }, // Activity names who said it (member:<id>)
        processed: { memory: true, profiler: false, triggers: false },
      });
      return { summary: 'noted for the profiler to review later' };

    case 'saveConfirmed':
    case 'saveUnconfirmed': {
      const scope = clampScopeForRole(decision.scope, params.role);
      const shareWith = decision.action === 'saveConfirmed' ? decision.shareWithMemberIds : undefined;
      const key = await resolveScopeKey(ctx, params.familyId, params.memberId, scope, shareWith, op.text);
      if (supersedes) {
        const prior = await ctx.db.get(supersedes);
        if (prior && prior.familyId === params.familyId) await ctx.db.patch(prior._id, { validUntil: params.now });
      }
      const memoryId = await ctx.db.insert('memories', {
        familyId: params.familyId,
        scope,
        scopeKey: key,
        about: op.about.length ? op.about : [params.memberId],
        kind: op.kind,
        text: op.text,
        source: { kind: 'message' },
        trigger: op.trigger,
        confidence: op.confidence,
        confirmed: decision.action === 'saveConfirmed',
        sensitive: op.sensitive,
        supersedes,
        pinned: false,
        createdAt: params.now,
        lastUsedAt: params.now,
        gate: op.gate ? { decidedBy: op.gate.decidedBy, reason: op.gate.reason } : undefined,
      });
      const chip = { memoryId, scope, label: `Saved · ${SCOPE_LABEL[scope]}` };
      return { memoryId, chip, summary: `saved (${SCOPE_LABEL[scope]})` };
    }

    case 'askBeforeSharing': {
      if (!params.threadId || !decision.shareWithMemberIds.length) return { summary: 'not saved (nowhere to ask)' };
      const names = await namesFor(ctx, decision.shareWithMemberIds);
      const block: UIBlock = {
        kind: 'confirm',
        prompt: `Want me to tell ${names.join(' and ')} that ${op.text}`,
        summary: [
          { label: 'About', value: op.text },
          { label: 'Share with', value: names.join(', ') },
        ],
      };
      const messageId = await ctx.db.insert('messages', {
        familyId: params.familyId,
        threadId: params.threadId,
        at: params.now,
        author: params.megaId ? { kind: 'mega', id: params.megaId } : { kind: 'system' },
        via: 'text',
        body: { type: 'block', block },
        chips: [],
      });
      return { choiceBlockMessageId: messageId, summary: 'asked before sharing' };
    }
  }
}
