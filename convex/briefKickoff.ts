import { v } from 'convex/values';
import { ASSISTANT_BRIEF as C } from '../shared/config/assistantBrief';
import { LIMITS } from '../shared/config';
import { ageGroupOf } from '../shared/ageGroups';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { callModel, parseJson } from './model/modelCall';
import { showKickoff } from './model/assistantBriefs';
import { googleAvailable } from './model/tokenVault';
import { memberIntegrations, statusOf } from './model/integrations';
import { clock } from './ports/clock';

const requestArgs = { briefId: v.id('assistantBriefs'), revision: v.number() };
const proposal = v.object({ prompt: v.string(), task: v.string(), emailReason: v.string() });
export const KICKOFF_SCHEMA = { type: 'object', properties: {
  prompt: { type: 'string', maxLength: C.kickoff.maxPrompt },
  task: { type: 'string', maxLength: C.kickoff.maxTask },
  emailReason: { type: 'string', maxLength: C.kickoff.maxEmailReason },
}, required: ['prompt', 'task', 'emailReason'], additionalProperties: false };

export const context = internalQuery({
  args: requestArgs,
  handler: async (ctx, { briefId, revision }) => {
    const row = await ctx.db.get(briefId);
    if (!row || row.step !== 'ready' || row.status !== 'accepted' || !row.approved || row.kickoffRevision !== revision || row.kickoff) return null;
    const member = await ctx.db.get(row.memberId);
    if (!member || member.familyId !== row.familyId) return null;
    const integrations = await memberIntegrations(ctx, row.familyId, row.memberId);
    const connected = integrations.filter(i => statusOf(i) === 'connected').map(i => i.kind);
    const offerGoogle = googleAvailable() && ageGroupOf(member, new Date(clock.realNow()).toISOString().slice(0,10)) !== 'child' && !(connected.includes('gmail') && connected.includes('googleCalendar'));
    return { familyId: row.familyId, approved: row.approved, name: member.name, offerGoogle };
  },
});

/** One bounded model call proposes work; it has no tools and cannot execute the brief. */
export const generate = internalAction({
  args: requestArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.briefKickoff.context, args);
    if (!data) return null;
    const focus = (data.approved.goal || data.approved.context || data.approved.firstTask || data.approved.proactive).slice(0, 220);
    let result = {
      prompt: `You mentioned: “${focus}”. I can turn that into a short plan with one manageable first step. Shall I draft it?`,
      task: C.kickoff.fallbackTaskPrefix + focus,
      emailReason: '',
    };
    try {
      const response = await callModel(ctx, data.familyId, {
        messages: [{ role: 'system', content: C.kickoff.prompt }, { role: 'user', content: JSON.stringify(data) }],
        schema: { name: 'brief_first_suggestion', schema: KICKOFF_SCHEMA, strict: true },
        maxTokens: LIMITS.agent.maxTokensStructured, effort: LIMITS.agent.effort,
      });
      const parsed = parseJson<Record<string, unknown>>(response.text);
      if (parsed && typeof parsed.prompt === 'string' && parsed.prompt.trim() && parsed.prompt.length <= C.kickoff.maxPrompt && typeof parsed.task === 'string' && parsed.task.trim() && parsed.task.length <= C.kickoff.maxTask && typeof parsed.emailReason === 'string' && parsed.emailReason.length <= C.kickoff.maxEmailReason) {
        result = { prompt: parsed.prompt.trim(), task: parsed.task.trim(), emailReason: data.offerGoogle ? parsed.emailReason.trim() : '' };
      }
    } catch {
      // Offline/budget exhaustion still leaves a useful, actionable proposal.
    }
    await ctx.runMutation(internal.briefKickoff.finish, { ...args, proposal: result });
    return null;
  },
});

export const finish = internalMutation({
  args: { ...requestArgs, proposal },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.briefId);
    // Ignore retries, a changed brief, or a user who already continued chatting.
    if (!row || row.status !== 'accepted' || row.step !== 'ready' || row.kickoffRevision !== args.revision || row.kickoff) return null;
    await ctx.db.patch(row._id, { kickoff: args.proposal });
    await showKickoff(ctx, { ...row, kickoff: args.proposal }, await clock.now(ctx, row.familyId));
    return null;
  },
});
