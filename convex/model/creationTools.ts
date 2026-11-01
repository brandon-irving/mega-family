import { renameOwnMega } from './renameMega';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { activeDraft, draftSummary, reviewDraft, updateDraft, confirmDraft, cancelDraft } from './megaCreation';
import { reviewOwnBrief } from './assistantBriefs';
import { fail } from './errors';
import { MEGA_CREATION } from '../../shared/config/megaCreation';

/** Shared native-agent/MCP execution. Identity and the thread come from the caller, never tool input. */
export async function executeCreationTool(ctx: MutationCtx, member: Doc<'members'>, threadId: Id<'threads'>, name: string, raw: Record<string, unknown>, now: number) {
  if (member.role === 'kid') fail('FORBIDDEN');
  const thread = await ctx.db.get(threadId);
  if (!thread || thread.familyId !== member.familyId || thread.ownerId !== member._id) fail('FORBIDDEN');
  if (name === 'mega_rename') {
    if (Object.keys(raw).some(key => key !== 'name')) fail('VALIDATION');
    return { text: `Your MEGA is now named ${await renameOwnMega(ctx, member, raw.name)}.` };
  }
  if (name === 'mega_draft_cancel') {
    if (raw.confirmed !== true) return { text: `${MEGA_CREATION.discardTitle} ${MEGA_CREATION.discardBody} Ask the person to choose Keep editing or Discard draft before calling again with confirmed=true.`, requiresConfirmation: true };
    await cancelDraft(ctx, member, raw.draftId, now); return { text: 'Draft cancelled. No person or MEGA was created.' }; }
  if (name === 'mega_brief_review') return { text: await reviewOwnBrief(ctx, member, raw, now), ui: { kind: 'confirmation' } };
  if (name === 'mega_draft_confirm') {
    if (raw.confirmed !== true || typeof raw.draftId !== 'string' || !Number.isInteger(raw.revision)) fail('VALIDATION', 'Explicit confirmation and the reviewed revision are required.');
    const memberId = await confirmDraft(ctx, member, raw.draftId, raw.revision as number, now);
    return { text: 'MEGA confirmed. No invitation has been sent.', memberId };
  }
  const row = name === 'mega_draft_get' ? await activeDraft(ctx, member)
    : name === 'mega_draft_update' ? await updateDraft(ctx, member, threadId, raw, now)
    : name === 'mega_draft_review' ? await reviewDraft(ctx, member, raw, now) : null;
  if (!row) return { text: 'No active draft. Discuss who the MEGA is for, then use mega_draft_update to save what they share.' };
  return { draftId: row._id, revision: row.revision, status: row.status, data: row.data,
    text: `${draftSummary(row.data)}${row.status === 'review' ? `\n${MEGA_CREATION.appearance}\nReply “confirm” to use this draft, or tell me what to change.` : '\nKeep discussing; this is only a draft.'}`,
    ui: { kind: row.status === 'review' ? 'megaDraft' : 'megaDraftPreview', draftId: row._id, revision: row.revision, data: row.data, prompt: row.status === 'review' ? MEGA_CREATION.review : MEGA_CREATION.appearance },
  };
}
