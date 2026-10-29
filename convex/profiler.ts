// G5: the nightly profiler's schedule (convex/model/profiler.ts has the rules). A cron sweep every
// PROFILER.sweepMinutes: for each family, once its local time passes PROFILER.runAt, one run per member with a
// login per local day (`profilerRuns` makes it idempotent); inside PROFILER.askWindow, due check questions are
// posted. Runs go through the spend guard; a failed model call records the run with `failure` (no retry storm).
import { v } from 'convex/values';
import { PROFILER } from '../shared/config/onboarding';
import { localDate, parseClockTime, zonedInstant } from '../shared/time';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { callModel, decidedByModel, parseJson } from './model/modelCall';
import { applyProfilerRun, askDueCheckQuestions, buildProfilerPrompt, memoriesForProfiler, PROFILER_MAX_TOKENS, PROFILER_SCHEMA, validateUpdates } from './model/profiler';
import { clock } from './ports/clock';

export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const family of await ctx.db.query('families').take(500)) {
      const now = await clock.now(ctx, family._id);
      const tz = family.timezone;
      const day = localDate(now, tz);
      const runAt = parseClockTime(PROFILER.runAt);
      const members = (await ctx.db.query('members').withIndex('by_family', (q) => q.eq('familyId', family._id)).collect()).filter((m) => !!m.authId);
      let i = 0;
      for (const member of members) {
        await askDueCheckQuestions(ctx, family, member, now);
        if (runAt === null || now < zonedInstant(day, runAt, tz)) continue;
        const ran = await ctx.db
          .query('profilerRuns')
          .withIndex('by_family_member_day', (q) => q.eq('familyId', family._id).eq('memberId', member._id).eq('day', day))
          .first();
        if (!ran) await ctx.scheduler.runAfter(1000 * i++, internal.profiler.runMember, { familyId: family._id, memberId: member._id, day });
      }
    }
    return null;
  },
});

export const loadRun = internalQuery({
  args: { familyId: v.id('families'), memberId: v.id('members'), day: v.string() },
  returns: v.union(v.null(), v.object({ name: v.string(), memories: v.array(v.object({ _id: v.id('memories'), text: v.string() })) })),
  handler: async (ctx, { familyId, memberId, day }) => {
    const member = await ctx.db.get(memberId);
    const family = await ctx.db.get(familyId);
    if (!member || !family || member.familyId !== familyId) return null;
    const done = await ctx.db
      .query('profilerRuns')
      .withIndex('by_family_member_day', (q) => q.eq('familyId', familyId).eq('memberId', memberId).eq('day', day))
      .first();
    if (done) return null;
    const now = await clock.now(ctx, familyId);
    const memories = await memoriesForProfiler(ctx, familyId, memberId, now - 24 * 60 * 60_000, now);
    return { name: member.name, memories: memories.map((m) => ({ _id: m._id, text: m.text })) };
  },
});

export const record = internalMutation({
  args: {
    familyId: v.id('families'),
    memberId: v.id('members'),
    day: v.string(),
    memoryIds: v.array(v.id('memories')),
    updates: v.array(
      v.object({
        memoryIndex: v.number(),
        kind: v.union(v.literal('basic'), v.literal('routine')),
        key: v.string(),
        value: v.string(),
        days: v.array(v.number()),
        time: v.string(),
        confidence: v.number(),
        question: v.string(),
      }),
    ),
    decidedBy: v.string(),
    failed: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, p) => {
    const family = await ctx.db.get(p.familyId);
    if (!family) return null;
    await applyProfilerRun(ctx, {
      familyId: p.familyId,
      memberId: p.memberId,
      day: p.day,
      memoryIds: p.memoryIds,
      updates: p.updates,
      decidedBy: p.decidedBy as `rule:${string}` | `model:${string}`,
      ...(p.failed ? { failure: 'error' as const } : {}),
      now: await clock.now(ctx, p.familyId),
      tz: family.timezone,
    });
    return null;
  },
});

export const runMember = internalAction({
  args: { familyId: v.id('families'), memberId: v.id('members'), day: v.string() },
  returns: v.null(),
  handler: async (ctx, { familyId, memberId, day }) => {
    const load = await ctx.runQuery(internal.profiler.loadRun, { familyId, memberId, day });
    if (!load) return null;
    const memoryIds = load.memories.map((m) => m._id);
    if (!load.memories.length) {
      await ctx.runMutation(internal.profiler.record, { familyId, memberId, day, memoryIds, updates: [], decidedBy: 'rule:noMemories' });
      return null;
    }
    const prompt = buildProfilerPrompt(load.name, load.memories);
    try {
      const result = await callModel(ctx, familyId, {
        model: 'judge',
        effort: 'low',
        maxTokens: PROFILER_MAX_TOKENS,
        schema: PROFILER_SCHEMA as unknown as { name: string; schema: Record<string, unknown>; strict: boolean },
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      });
      const updates = validateUpdates(parseJson(result.text), load.memories.length);
      await ctx.runMutation(internal.profiler.record, { familyId, memberId, day, memoryIds, updates, decidedBy: decidedByModel('judge') });
    } catch {
      await ctx.runMutation(internal.profiler.record, { familyId, memberId, day, memoryIds, updates: [], decidedBy: decidedByModel('judge'), failed: true });
    }
    return null;
  },
});
