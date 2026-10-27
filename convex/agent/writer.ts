// The memory writer (PLAN.md → Learnings: "after each turn, the memory writer... proposes add/update/expire
// operations, each with a suggested scope"). Runs as a separate scheduled turn after the reply is sent
// (convex/chat.ts's generateReply schedules `run`), so a model hiccup here never blocks or slows the user's
// actual reply. `applyLearningDecision` (convex/model/applyLearning.ts) is the single place a decision
// becomes a row — the same one the `remember` tool uses — so a save looks the same either way.
import { v } from 'convex/values';
import { LIMITS } from '../../shared/config';
import { CONCERN_CATEGORIES as SERVER_CONCERN_CATEGORIES } from '../../shared/config/learning';
import { chatCostCents, estimateChatCostCents } from '../../shared/config/pricing';
import { LEARNING_TRIGGERS, MEMORY_KINDS, SCOPES, role as roleValidator } from '../../shared/domain/enums';
import { literals } from '../../shared/domain/validators';
import type { Doc, Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { internalAction, internalMutation, internalQuery } from '../_generated/server';
import { getChatModel } from '../adapters/registry';
import { applyLearningDecision } from '../model/applyLearning';
import { gateByServerConcern, isConcernCategory, logDroppedConcern } from '../model/concernGate';
import { decideLearning, type LearningDecision, type LearningOp } from '../model/learningPolicy';
import { canSeeScoped } from '../model/visibility';
import { clock } from '../ports/clock';
import { ChatModelError } from '../ports/chatModel';

const CONCERN_CATEGORIES = ['health', 'feelings', 'schoolTrouble', 'kidTrait', 'none'] as const;

const OPERATIONS_SCHEMA = {
  type: 'object',
  properties: {
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          trigger: { type: 'string', enum: [...LEARNING_TRIGGERS] },
          kind: { type: 'string', enum: [...MEMORY_KINDS] },
          text: { type: 'string' },
          suggestedScope: { type: 'string', enum: [...SCOPES] },
          shareWithMemberIds: { type: 'array', items: { type: 'string' } },
          about: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          sensitive: { type: 'boolean' },
          concernCategory: { type: 'string', enum: [...CONCERN_CATEGORIES] },
          supersedesMemoryId: { type: 'string' },
          mattersToMemberId: { type: 'string' },
        },
        required: ['trigger', 'kind', 'text', 'suggestedScope', 'confidence', 'sensitive'],
        additionalProperties: false,
      },
    },
  },
  required: ['operations'],
  additionalProperties: false,
} as const;

interface RawProposal {
  trigger: string;
  kind: string;
  text: string;
  suggestedScope: string;
  shareWithMemberIds?: string[];
  about?: string[];
  confidence: number;
  sensitive: boolean;
  concernCategory?: string;
  supersedesMemoryId?: string;
  /** PLAN.md -> Proactive engine trigger source #1 ("the memory writer marks 'matters to Teal'"): set when
   * this fact is something a DIFFERENT named member should proactively hear about or be asked about (e.g.
   * "we're out of milk" -> the admin). `convex/model/proactive.ts`'s cross-member trigger reads this off
   * the `familyEvents` row `applyProposals` writes below — never trusted for anything else (it's not a
   * memory field; it only ever drives the proactive pipeline). */
  mattersToMemberId?: string;
}

function writerSystemPrompt(memberName: string, role: string, roster: { memberId: string; name: string }[]): string {
  return [
    `You just finished a conversation turn with ${memberName} (role: ${role}). Decide what, if anything, is worth remembering for next time.`,
    'Propose zero or more operations. Each needs a trigger (explicit = they said "remember..."/"from now on..."; correction = they corrected something already known, set supersedesMemoryId; stated = mentioned in passing; pattern/reaction = you noticed a recurring pattern, not something said this turn — rare from a single turn), a kind, the fact as a short sentence, a suggested scope, your confidence 0-1, and whether it is sensitive (health, money, feelings, relationships).',
    'Set concernCategory to "health", "feelings", "schoolTrouble", or "kidTrait" if this is a GUESS or inference you are making about those things — these are never saved unless the member said it about themselves, in which case still flag it so it is handled carefully. Otherwise set it to "none".',
    'Only propose a shared scope with shareWithMemberIds when this turn is specifically about telling another named member something personal.',
    `Family roster (name, id): ${roster.map((m) => `${m.name} (${m.memberId})`).join('; ')}. If this fact is something a DIFFERENT specific member (not ${memberName}) should be told or asked about — e.g. they said "we're out of milk" and the admin should know — set mattersToMemberId to that member's id. Only when it's genuinely actionable or worth telling them, not for every passing mention of someone's name.`,
    'Never propose anything from a web search result, or anything about another member\'s private conversation — you only ever see this member\'s own thread.',
    'If nothing is worth remembering, return an empty operations array.',
  ].join('\n');
}

async function loadMemberId(ctx: any, familyId: Id<'families'>, raw: string): Promise<Id<'members'> | null> {
  let doc: Doc<'members'> | null = null;
  try {
    doc = await ctx.db.get(raw as Id<'members'>);
  } catch {
    doc = null;
  }
  return doc && doc.familyId === familyId ? doc._id : null;
}

export const run = internalAction({
  args: {
    familyId: v.id('families'),
    memberId: v.id('members'),
    memberName: v.string(),
    role: roleValidator,
    megaId: v.optional(v.id('megas')),
    threadId: v.id('threads'),
    replyMessageId: v.id('messages'),
    userText: v.string(),
    replyText: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const model = getChatModel();
    const roster = await ctx.runQuery(internal.agent.writer.rosterFor, { familyId: args.familyId, excludeMemberId: args.memberId });
    const messages = [
      { role: 'system' as const, content: writerSystemPrompt(args.memberName, args.role, roster) },
      { role: 'user' as const, content: `Member said: ${args.userText}\nMEGA replied: ${args.replyText}` },
    ];
    const maxTokens = LIMITS.agent.maxTokensStructured;
    const estimatedCents = estimateChatCostCents(args.userText.length + args.replyText.length, maxTokens);
    let reserved = false;

    try {
      await ctx.runMutation(internal.spend.requireBudget, { familyId: args.familyId, estimatedCents });
      reserved = true;
      const result = await model.chat({ messages, schema: { name: 'learnings', schema: OPERATIONS_SCHEMA, strict: true }, maxTokens, effort: LIMITS.agent.effort });
      await ctx.runMutation(internal.spend.recordUsage, {
        familyId: args.familyId,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        cents: chatCostCents(result.usage.tokensIn, result.usage.tokensOut, result.usage.cachedTokensIn ?? 0),
        releaseCents: estimatedCents,
      });
      reserved = false;

      const parsed = result.text ? JSON.parse(result.text) : { operations: [] };
      const operations: RawProposal[] = Array.isArray(parsed?.operations) ? parsed.operations : [];
      if (operations.length) {
        // G2 security review (BLOCKER): never trust the writer model's own `concernCategory`/`trigger` for
        // the never-save gate — classify each proposed fact independently (text + who it's about only,
        // never this conversation) the same way the `remember` tool's calls are (convex/agent/
        // concernClassifier.ts, convex/model/concernGate.ts).
        const classified: (RawProposal & { serverConcern: (typeof SERVER_CONCERN_CATEGORIES)[number] })[] = [];
        for (const op of operations) {
          const aboutNames = op.about?.length ? await ctx.runQuery(internal.agent.writer.memberNamesForConcernCheck, { familyId: args.familyId, memberIds: op.about }) : [];
          const { category } = await ctx.runAction(internal.agent.concernClassifier.classify, { familyId: args.familyId, text: op.text, aboutNames });
          classified.push({ ...op, serverConcern: category });
        }
        await ctx.runMutation(internal.agent.writer.applyProposals, {
          familyId: args.familyId,
          memberId: args.memberId,
          role: args.role,
          megaId: args.megaId,
          threadId: args.threadId,
          replyMessageId: args.replyMessageId,
          proposals: classified,
        });
      }
    } catch (e) {
      if (reserved) await ctx.runMutation(internal.spend.releaseReservation, { familyId: args.familyId, estimatedCents });
      // A writer failure is never user-facing — the reply already went out. Swallowed, not rethrown, so a
      // scheduler retry can't hammer spend on a model that's down; BUDGET_EXCEEDED also lands here safely.
      if (!(e instanceof ChatModelError)) throw e; // a non-model bug (e.g. a real coding error) should surface in logs
    }
    return null;
  },
});

/** Resolves member ids (from a writer proposal's `about`) to names for the concern classifier — it sees
 * only "who this is about", never anything else about them. Tolerant of a malformed id (same pattern as
 * `loadMemberId` below): skipped rather than thrown, since this is advisory context for the classifier, not
 * a permission check. */
export const memberNamesForConcernCheck = internalQuery({
  args: { familyId: v.id('families'), memberIds: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const names: string[] = [];
    for (const raw of args.memberIds) {
      let doc: Doc<'members'> | null = null;
      try {
        doc = await ctx.db.get(raw as Id<'members'>);
      } catch {
        doc = null;
      }
      if (doc && doc.familyId === args.familyId) names.push(doc.name);
    }
    return names;
  },
});

/** The roster (minus the member currently talking) for the writer's `mattersToMemberId` prompt — the
 * model needs real member ids to name a target, the same way `agent/context.ts` gives the main chat loop
 * a roster. */
export const rosterFor = internalQuery({
  args: { familyId: v.id('families'), excludeMemberId: v.id('members') },
  returns: v.array(v.object({ memberId: v.id('members'), name: v.string() })),
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query('members')
      .withIndex('by_family', (q) => q.eq('familyId', args.familyId))
      .collect();
    return members.filter((m) => m._id !== args.excludeMemberId).map((m) => ({ memberId: m._id, name: m.name }));
  },
});

/** S1: the visibility half of the mattersTo trigger gate. The proposer (`ownerId`) is NEVER the target
 * (the call site already checked `targetId !== args.memberId`), so a `personal` decision — whose owner is
 * always the proposer — can never be visible to the target; this matches the intent exactly ("a personal
 * fact should never become a cross-member trigger"). `shared` is visible only when the target is one of
 * the members actually being shared with. `queueForProfiler` (no scope was even decided yet) is treated as
 * not visible — there's nothing confirmed to show anyone. */
function mattersToTriggerVisibleToTarget(decision: LearningDecision, target: { memberId: Id<'members'>; role: Doc<'members'>['role'] }, ownerId: Id<'members'>): boolean {
  switch (decision.action) {
    case 'saveConfirmed':
    case 'saveUnconfirmed':
      return canSeeScoped(decision.scope, target, { ownerId, who: decision.action === 'saveConfirmed' ? decision.shareWithMemberIds : undefined });
    case 'askBeforeSharing':
      return canSeeScoped(decision.scope, target, { ownerId, who: decision.shareWithMemberIds });
    case 'queueForProfiler':
    case 'drop':
      return false;
  }
}

export const applyProposals = internalMutation({
  args: {
    familyId: v.id('families'),
    memberId: v.id('members'),
    role: roleValidator,
    megaId: v.optional(v.id('megas')),
    threadId: v.id('threads'),
    replyMessageId: v.id('messages'),
    proposals: v.array(
      v.object({
        trigger: v.string(),
        kind: v.string(),
        text: v.string(),
        suggestedScope: v.string(),
        shareWithMemberIds: v.optional(v.array(v.string())),
        about: v.optional(v.array(v.string())),
        confidence: v.number(),
        sensitive: v.boolean(),
        concernCategory: v.optional(v.string()), // the writer's own (untrusted) label — kept for logging only, never for the gate; see serverConcern
        supersedesMemoryId: v.optional(v.string()),
        mattersToMemberId: v.optional(v.string()),
        /** The independent classification `run` computed per-op before calling here (never the writer
         * model's own `concernCategory` above) — the only thing the gate below actually trusts. */
        serverConcern: literals(SERVER_CONCERN_CATEGORIES),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = await clock.now(ctx, args.familyId);
    const chips: { memoryId: Id<'memories'>; scope: (typeof SCOPES)[number]; label: string }[] = [];

    for (const p of args.proposals) {
      if (!(LEARNING_TRIGGERS as readonly string[]).includes(p.trigger)) continue;
      if (!(MEMORY_KINDS as readonly string[]).includes(p.kind)) continue;
      if (!(SCOPES as readonly string[]).includes(p.suggestedScope)) continue;
      if (!p.text.trim()) continue;

      const about: Id<'members'>[] = [];
      for (const raw of p.about ?? []) {
        const id = await loadMemberId(ctx, args.familyId, raw);
        if (id) about.push(id);
      }
      const shareWithMemberIds: Id<'members'>[] = [];
      for (const raw of p.shareWithMemberIds ?? []) {
        const id = await loadMemberId(ctx, args.familyId, raw);
        if (id) shareWithMemberIds.push(id);
      }
      let supersedes: Id<'memories'> | undefined;
      if (p.supersedesMemoryId) {
        let prior: Doc<'memories'> | null = null;
        try {
          prior = await ctx.db.get(p.supersedesMemoryId as Id<'memories'>);
        } catch {
          prior = null;
        }
        if (prior && prior.familyId === args.familyId) supersedes = prior._id;
      }

      let op: LearningOp = {
        trigger: p.trigger as LearningOp['trigger'],
        kind: p.kind as LearningOp['kind'],
        text: p.text,
        suggestedScope: p.suggestedScope as LearningOp['suggestedScope'],
        shareWithMemberIds: shareWithMemberIds.length ? shareWithMemberIds : undefined,
        confidence: Number.isFinite(p.confidence) ? Math.max(0, Math.min(1, p.confidence)) : 0,
        sensitive: p.sensitive,
        about: about.length ? about : [args.memberId],
        concernCategory: undefined, // never the writer's own (untrusted) label — only `gateByServerConcern` below sets this
        derivedFromWebSearch: false, // G2: the web_search tool isn't implemented yet; gateByServerConcern may still set this from serverConcern
      };
      if (isConcernCategory(p.serverConcern)) op = gateByServerConcern(op, p.serverConcern);
      const decision = decideLearning(op, args.memberId);
      if (decision.action === 'drop' && p.serverConcern !== 'ok') {
        await logDroppedConcern(ctx, { familyId: args.familyId, memberId: args.memberId, now }, p.text, p.serverConcern, decision.reason);
      }
      const applied = await applyLearningDecision(ctx, { familyId: args.familyId, memberId: args.memberId, role: args.role, megaId: args.megaId ?? null, threadId: args.threadId, now }, op, decision, supersedes);
      if (applied.chip) chips.push(applied.chip);

      // PLAN.md -> Proactive engine trigger source #1 ("the memory writer marks 'matters to Teal'"): never
      // trusted for anything about the fact's own content — only this one pointer, and only once it
      // resolves to a real, different member of this family. convex/model/proactive.ts's cross-member
      // trigger (`scanFamilyEventTriggers`) picks this up and runs it through the full draft+judge pipeline.
      //
      // S1 (BLOCKER, G3 security review): this used to fire unconditionally off the model's own
      // `mattersToMemberId` label, even for a proposal the concern gate just dropped (a concerning guess
      // about THIS member) or one scoped `personal`/`shared`-not-including-the-target (private content the
      // target was never meant to see). A personal fact, a concern-flagged one, or a dropped one must never
      // become a cross-member trigger — so the SAME three things that decided whether this got saved as a
      // memory (never trusting the model's own labels) also gate whether it can ever reach another member
      // as a notification: the proposal has to have actually passed the gate (`decision.action !== 'drop'`
      // and the independent `serverConcern === 'ok'`), AND the content has to be visible to the target
      // under the normal scope/sharing rules (`canSeeScoped`, reused rather than re-derived) — e.g. a
      // `personal` memory is never visible to anyone but its own owner, so it can never trigger here either.
      if (p.mattersToMemberId) {
        const targetId = await loadMemberId(ctx, args.familyId, p.mattersToMemberId);
        if (targetId && targetId !== args.memberId && decision.action !== 'drop' && p.serverConcern === 'ok') {
          const target = await ctx.db.get(targetId);
          if (target && mattersToTriggerVisibleToTarget(decision, { memberId: targetId, role: target.role }, args.memberId)) {
            await ctx.db.insert('familyEvents', {
              familyId: args.familyId,
              at: now,
              type: 'said',
              payload: { mattersToMemberId: targetId, fromMemberId: args.memberId, text: p.text },
              processed: { memory: true, profiler: false, triggers: false },
            });
          }
        }
      }
    }

    if (chips.length) {
      const message = await ctx.db.get(args.replyMessageId);
      if (message) await ctx.db.patch(message._id, { chips: [...message.chips, ...chips] });
    }
    return null;
  },
});
