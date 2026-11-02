import type { Doc } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import type { MutationCtx } from '../_generated/server';
import { postOwnMegaMessage } from './threads';
import { createRequestCandidate } from './proactive';
import { selectionCanConfirm } from '../../shared/scheduling';
import { formatLocalDateTime } from '../../shared/time';
import { canAnswerScheduling, requestsForPlan } from './schedulingRequests';
import { COORDINATION_COPY } from '../../shared/config/scheduling';

/** Definite offered slots need family acceptance, not another round-trip to the sender. */
export async function confirmAcceptedSelection(ctx: MutationCtx, plan: Doc<'mailPlans'>, now: number) {
  if (plan.status !== 'held' || !plan.selected || !selectionCanConfirm(plan)) return false;
  const requests = await requestsForPlan(ctx, plan.familyId, plan._id);
  if (!plan.participantIds.filter(id => id !== plan.ownerId).every(id => requests.some(r => r.toMemberId === id && r.scheduling?.planId === plan._id && r.scheduling.revision === plan.revision && r.status === 'accepted'))) return false;
  await ctx.db.patch(plan._id, { status: 'confirmed', confirmedBySelection: true, slots: [plan.selected], calendarOperation: 'uncertain', updatedAt: now });
  await ctx.scheduler.runAfter(0, internal.scheduling.reconcileInternal, { planId: plan._id, revision: plan.revision });
  return true;
}

/** A hold authorizes sharing its title/time with the named participants, not its source email. */
export async function requestSchedulingConfirmation(ctx: MutationCtx, plan: Doc<'mailPlans'>, now: number) {
  if (plan.status !== 'held' || !plan.selected) return;
  const owner = await ctx.db.get(plan.ownerId);
  const family = await ctx.db.get(plan.familyId);
  if (!owner || !family) return;
  const names: string[] = [];
  for (const id of plan.participantIds.filter(id => id !== plan.ownerId)) {
    const person = await ctx.db.get(id);
    if (!person || person.familyId !== plan.familyId || !await canAnswerScheduling(ctx, person)) continue;
    const existing = await requestsForPlan(ctx, plan.familyId, plan._id);
    if (existing.some(r => r.toMemberId === id && r.scheduling?.revision === plan.revision)) continue;
    const text = `${owner.name} chose ${formatLocalDateTime(plan.selected.start, family.timezone)} for ${plan.title}. Does that time work for you? If you accept, I’ll add the confirmed meeting to your connected calendar.`;
    const requestId = await ctx.db.insert('requests', { familyId: plan.familyId, fromMemberId: owner._id, toMemberId: id, text, status: 'open', scheduling: { planId: plan._id, revision: plan.revision } });
    await postOwnMegaMessage(ctx, plan.familyId, id, { type: 'card', card: { kind: 'request', requestId } }, now);
    await createRequestCandidate(ctx, { familyId: plan.familyId, recipientId: id, requestId, text, now });
    names.push(person.name);
  }
  if (names.length) await postOwnMegaMessage(ctx, plan.familyId, owner._id, { type: 'text', text: `I held ${formatLocalDateTime(plan.selected.start, family.timezone)} on your calendar and asked ${names.join(' and ')} to confirm. The email sender has not been notified.` }, now);
}

export async function answerSchedulingRequest(ctx: MutationCtx, request: Doc<'requests'>, accept: boolean, now: number) {
  const plan = await ctx.db.get(request.scheduling!.planId);
  if (!plan || plan.familyId !== request.familyId || plan.ownerId !== request.fromMemberId || !plan.participantIds.includes(request.toMemberId) || plan.revision !== request.scheduling!.revision || plan.status !== 'held') {
    await ctx.db.patch(request._id, { status: 'done' });
    return 'This proposal has changed. Please review the latest request.';
  }
  await ctx.db.patch(request._id, { status: accept ? 'accepted' : 'declined', scheduling: { ...request.scheduling!, calendarAuthorized: accept, acceptedSlot: accept ? plan.selected : undefined } });
  const confirmed = accept && await confirmAcceptedSelection(ctx, plan, now);
  const person = await ctx.db.get(request.toMemberId);
  const text = confirmed ? `Everyone agreed to an offered time for ${plan.title}! I’m confirming the event on your calendar now. You don’t need to wait for another email from the organizer.` : accept ? `${person?.name ?? 'Your family member'} confirmed the proposed time for ${plan.title}. ${selectionCanConfirm(plan) ? 'I’m waiting for the remaining family participants to accept.' : 'Your calendar hold remains tentative until the email sender confirms.'}` : `${person?.name ?? 'Your family member'} cannot make the proposed time for ${plan.title}. Cancel this hold and choose another time.`;
  await postOwnMegaMessage(ctx, plan.familyId, plan.ownerId, { type: 'text', text }, now);
  if (accept) await postOwnMegaMessage(ctx, plan.familyId, plan.ownerId, { type: 'card', card: { kind: 'mailPlan', planId: plan._id } }, now);
  await postOwnMegaMessage(ctx, plan.familyId, request.toMemberId, { type: 'text', text: accept ? 'I sent your confirmation. Once the meeting is confirmed, I’ll add it to your connected calendar.' : 'I let them know that time does not work for you.' }, now);
  return accept ? 'Confirmation sent.' : 'Response sent.';
}

/** Retire consent prompts and tell every still-involved participant exactly once. */
export async function cancelSchedulingRequests(ctx: MutationCtx, plan: Doc<'mailPlans'>, now: number) {
  for (const request of await requestsForPlan(ctx, plan.familyId, plan._id)) {
    if (request.status !== 'open' && request.status !== 'accepted') continue;
    const text = COORDINATION_COPY.cancelled(plan.title, !!request.scheduling?.calendarExternalId);
    await ctx.db.patch(request._id, { status: 'done' });
    await postOwnMegaMessage(ctx, plan.familyId, request.toMemberId, { type: 'text', text }, now);
    if (request.notificationId) {
      const notification = await ctx.db.get(request.notificationId);
      if (notification && !notification.answer) await ctx.db.patch(notification._id, { answer: { buttonId: 'cancelled', at: now, via: 'text' }, reply: text });
    }
  }
}
