// The memory writer (PLAN.md → Learnings: "after each turn, the memory writer... proposes add/update/expire
// operations, each with a suggested scope"). Runs as a separate scheduled turn after the reply is sent
// (convex/chat.ts's generateReply schedules `run`), so a model hiccup here never blocks or slows the user's
// actual reply. `applyLearningDecision` (convex/model/applyLearning.ts) is the single place a decision
// becomes a row — the same one the `remember` tool uses — so a save looks the same either way.
import { v } from 'convex/values';
import { LIMITS } from '../../shared/config';
import { chatCostCents, estimateChatCostCents } from '../../shared/config/pricing';
import { LEARNING_TRIGGERS, MEMORY_KINDS, SCOPES } from '../../shared/domain/enums';
import { role as roleValidator } from '../../shared/domain/enums';
import type { Doc, Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { internalAction, internalMutation } from '../_generated/server';
import { getChatModel } from '../adapters/registry';
import { applyLearningDecision } from '../model/applyLearning';
import { decideLearning, type LearningOp } from '../model/learningPolicy';
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
}

function writerSystemPrompt(memberName: string, role: string): string {
  return [
    `You just finished a conversation turn with ${memberName} (role: ${role}). Decide what, if anything, is worth remembering for next time.`,
    'Propose zero or more operations. Each needs a trigger (explicit = they said "remember..."/"from now on..."; correction = they corrected something already known, set supersedesMemoryId; stated = mentioned in passing; pattern/reaction = you noticed a recurring pattern, not something said this turn — rare from a single turn), a kind, the fact as a short sentence, a suggested scope, your confidence 0-1, and whether it is sensitive (health, money, feelings, relationships).',
    'Set concernCategory to "health", "feelings", "schoolTrouble", or "kidTrait" if this is a GUESS or inference you are making about those things — these are never saved unless the member said it about themselves, in which case still flag it so it is handled carefully. Otherwise set it to "none".',
    'Only propose a shared scope with shareWithMemberIds when this turn is specifically about telling another named member something personal.',
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
    const messages = [
      { role: 'system' as const, content: writerSystemPrompt(args.memberName, args.role) },
      { role: 'user' as const, content: `Member said: ${args.userText}\nMEGA replied: ${args.replyText}` },
    ];
    const maxTokens = LIMITS.agent.maxTokensStructured;

    try {
      await ctx.runMutation(internal.spend.requireBudget, { familyId: args.familyId, estimatedCents: estimateChatCostCents(args.userText.length + args.replyText.length, maxTokens) });
      const result = await model.chat({ messages, schema: { name: 'learnings', schema: OPERATIONS_SCHEMA, strict: true }, maxTokens, effort: LIMITS.agent.effort });
      await ctx.runMutation(internal.spend.recordUsage, {
        familyId: args.familyId,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        cents: chatCostCents(result.usage.tokensIn, result.usage.tokensOut, result.usage.cachedTokensIn ?? 0),
      });

      const parsed = result.text ? JSON.parse(result.text) : { operations: [] };
      const operations: RawProposal[] = Array.isArray(parsed?.operations) ? parsed.operations : [];
      if (operations.length) {
        await ctx.runMutation(internal.agent.writer.applyProposals, {
          familyId: args.familyId,
          memberId: args.memberId,
          role: args.role,
          megaId: args.megaId,
          threadId: args.threadId,
          replyMessageId: args.replyMessageId,
          proposals: operations,
        });
      }
    } catch (e) {
      // A writer failure is never user-facing — the reply already went out. Swallowed, not rethrown, so a
      // scheduler retry can't hammer spend on a model that's down; BUDGET_EXCEEDED also lands here safely.
      if (!(e instanceof ChatModelError)) throw e; // a non-model bug (e.g. a real coding error) should surface in logs
    }
    return null;
  },
});

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
        concernCategory: v.optional(v.string()),
        supersedesMemoryId: v.optional(v.string()),
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

      const concern = p.concernCategory && p.concernCategory !== 'none' ? (p.concernCategory as LearningOp['concernCategory']) : undefined;
      const op: LearningOp = {
        trigger: p.trigger as LearningOp['trigger'],
        kind: p.kind as LearningOp['kind'],
        text: p.text,
        suggestedScope: p.suggestedScope as LearningOp['suggestedScope'],
        shareWithMemberIds: shareWithMemberIds.length ? shareWithMemberIds : undefined,
        confidence: Number.isFinite(p.confidence) ? Math.max(0, Math.min(1, p.confidence)) : 0,
        sensitive: p.sensitive,
        about: about.length ? about : [args.memberId],
        concernCategory: concern,
        derivedFromWebSearch: false, // G2: the web_search tool isn't implemented yet, so this is always false
      };
      const decision = decideLearning(op, args.memberId);
      const applied = await applyLearningDecision(ctx, { familyId: args.familyId, memberId: args.memberId, role: args.role, megaId: args.megaId ?? null, threadId: args.threadId, now }, op, decision, supersedes);
      if (applied.chip) chips.push(applied.chip);
    }

    if (chips.length) {
      const message = await ctx.db.get(args.replyMessageId);
      if (message) await ctx.db.patch(message._id, { chips: [...message.chips, ...chips] });
    }
    return null;
  },
});
