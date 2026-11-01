import { connectorAllowed } from './integrations';
import { schedulingReply } from '../../shared/scheduling';
import { COORDINATION_COPY, SCHEDULING } from '../../shared/config/scheduling';
import type { EmailPlan, PlanView, TimeSlot } from '../../shared/domain/scheduling';
import { formatLocalDateTime, localDate, zonedInstant } from '../../shared/time';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { internal } from '../_generated/api';
import { clock } from '../ports/clock';
import { fail } from './errors';
import { memberIntegrations, statusOf } from './integrations';
import { enqueueCardCandidate } from './proactive';
import { maybeSuggestEventShare } from './layers';
import { postOwnMegaMessage } from './threads';

type Ctx = QueryCtx | MutationCtx;
export const preferenceFor = (ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>) => ctx.db.query('schedulingPreferences').withIndex('by_family_member', q => q.eq('familyId', familyId).eq('memberId', memberId)).unique();
export async function ownPlan(ctx: Ctx, member: Doc<'members'>, id: Id<'mailPlans'>) {
  const p = await ctx.db.get(id);
  if (!p || p.familyId !== member.familyId || p.ownerId !== member._id || !connectorAllowed(member)) fail('NOT_FOUND');
  return p;
}
export async function writePermissions(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>) {
  const s = await ctx.db.query('integrationSecrets').withIndex('by_family_member_provider', q => q.eq('familyId', familyId).eq('memberId', memberId).eq('provider', 'google')).unique();
  const rows = await memberIntegrations(ctx, familyId, memberId);
  return { canWriteCalendar: !!s?.scopes.includes(SCHEDULING.scopes.calendar) && rows.some(r => r.kind === 'googleCalendar' && statusOf(r) === 'connected'),
    canWriteDraft: !!s?.scopes.includes(SCHEDULING.scopes.drafts) && rows.some(r => r.kind === 'gmail' && statusOf(r) === 'connected') };
}

export const overlaps = (a: TimeSlot, b: TimeSlot) => a.start < b.end && b.start < a.end;

/** A narrow availability capability. Private event objects never leave this function. */
async function memberBusy(ctx: Ctx, p: Doc<'mailPlans'>, memberId: Id<'members'>, from: number, to: number, now: number, tz: string, events: Doc<'events'>[]): Promise<{ checked: boolean; busy: TimeSlot[] }> {
  const member = await ctx.db.get(memberId);
  if (!member || member.familyId !== p.familyId || !connectorAllowed(member)) return { checked: false, busy: [] };
  if (memberId !== p.ownerId) {
    const permission = await preferenceFor(ctx, p.familyId, memberId);
    if (!permission?.enabled || !permission.availabilityFor.includes(p.ownerId)) return { checked: false, busy: [] };
  }
  const sources = (await memberIntegrations(ctx, p.familyId, memberId)).filter(i => ['googleCalendar', 'deviceCalendar', 'ics'].includes(i.kind) && statusOf(i) !== 'disconnected');
  // Never label an unavailable or stale external calendar as empty/free.
  if (sources.some(s => s.kind === 'googleCalendar' && (!(s.config as { availabilityComplete?: boolean }).availabilityComplete || ((s.config as { windowStart?: number }).windowStart ?? Infinity) > from || ((s.config as { windowEnd?: number }).windowEnd ?? -Infinity) < to))) return { checked: false, busy: [] };
  if (sources.some(s => statusOf(s) !== 'connected' || !!s.lastFailure || s.lastSyncAt === undefined || now - s.lastSyncAt > SCHEDULING.calendarFreshSeconds * 1000)) return { checked: false, busy: [] };
  if (events.length > SCHEDULING.maxAvailabilityEvents) return { checked: false, busy: [] };
  const busy = events.filter(e => !e.cancelled && e._id !== p.eventId && (e.scope === 'personal' ? e.ownerId === memberId : e.who.includes(memberId))).map(e => ({ start: e.start, end: e.end ?? zonedInstant(localDate(e.start, tz), 24 * 60, tz) }));
  const inFlight = await ctx.db.query('mailPlans').withIndex('by_owner', q => q.eq('familyId', p.familyId).eq('ownerId', memberId)).collect();
  for (const other of inFlight) if (other._id !== p._id && other.selected && (other.calendarOperation === 'running' || other.calendarOperation === 'uncertain')) busy.push(other.selected);
  return { checked: true, busy };
}

export async function buildPlanView(ctx: Ctx, p: Doc<'mailPlans'>): Promise<PlanView> {
  const family = await ctx.db.get(p.familyId);
  if (!family) fail('NOT_FOUND');
  const now = await clock.now(ctx, p.familyId);
  const tz = family.timezone;
  const slots = p.slots;
  const people = await Promise.all(p.participantIds.map(id => ctx.db.get(id)));
  const validPeople = people.filter((m): m is Doc<'members'> => !!m && m.familyId === p.familyId);
  const alternatives: TimeSlot[] = [];
  if (slots.length && ['proposed', 'review'].includes(p.status)) {
    const day = localDate(slots[0].start, tz);
    const duration = slots[0].end - slots[0].start;
    const last = zonedInstant(day, SCHEDULING.dayEndHour * 60, tz);
    for (let start = zonedInstant(day, SCHEDULING.dayStartHour * 60, tz); start + duration <= last; start += SCHEDULING.alternativeStepMinutes * 60_000) {
      if (start > now && !slots.some(s => s.start === start)) alternatives.push({ start, end: start + duration });
    }
  }
  const all = [...slots, ...alternatives];
  const from = all.length ? Math.min(...all.map(s => s.start)) : now;
  const to = all.length ? Math.max(...all.map(s => s.end)) : now;
  const events = await ctx.db.query('events').withIndex('by_family_start', q => q.eq('familyId', p.familyId).lt('start', to)).order('desc').take(SCHEDULING.maxAvailabilityEvents + 1);
  const checks = await Promise.all(p.participantIds.map(id => memberBusy(ctx, p, id, from, to, now, tz, events)));
  const checked = checks.every(c => c.checked) && !p.missing.length;
  const available = (s: TimeSlot) => checked && s.start > now && !checks.some(c => c.busy.some(b => overlaps(s, b)));
  const shown = slots.map(s => ({ ...s, checked, available: available(s), alternative: false }));
  if (!shown.some(s => s.available)) shown.push(...alternatives.filter(available).slice(0, SCHEDULING.alternativeCount).map(s => ({ ...s, checked, available: true, alternative: true })));
  const unavailableNames = p.participantIds.flatMap((id, i) => checks[i].checked ? [] : [validPeople.find(m => m._id === id)?.name ?? 'A participant']);
  const conflict = shown.find(s => s.checked && !s.available && s.start > now);
  const busyNames = conflict ? p.participantIds.flatMap((id, i) => checks[i].checked && checks[i].busy.some(b => overlaps(conflict, b)) ? [id === p.ownerId ? 'Your calendar' : validPeople.find(m => m._id === id)?.name ?? 'A participant'] : []) : [];
  const next = shown.find(s => s.available);
  const guidance = ['proposed', 'review'].includes(p.status) ? unavailableNames.length ? COORDINATION_COPY.unknown(unavailableNames) : p.missing.length ? 'I need a few details confirmed before checking these times.' : [busyNames.length && conflict ? COORDINATION_COPY.conflict(busyNames, formatLocalDateTime(conflict.start, tz)) : '', next ? COORDINATION_COPY.available(formatLocalDateTime(next.start, tz)) : COORDINATION_COPY.noSlots].filter(Boolean).join(' ') : undefined;
  const integration = await ctx.db.get(p.integrationId);
  return { id: p._id, title: p.title, status: p.status, revision: p.revision, timezone: tz, slots: shown,
    guidance, participantNames: validPeople.map(m => m.name), unavailableNames,
    missing: p.missing, durationAssumed: p.durationAssumed, selected: p.selected, eventId: p.eventId,
    canUndo: !!p.ownsEvent && !!p.eventId && !p.calendarExternalId,
    sourceUrl: `https://mail.google.com/mail/?authuser=${encodeURIComponent(integration?.label ?? '')}#all/${encodeURIComponent(p.sourceMessageId)}`,
    sourceLabel: p.sourceLabel, replyText: p.selected ? schedulingReply(p.selected, tz) : undefined,
    calendarOperation: p.calendarOperation, draftOperation: p.draftOperation,
    ...await writePermissions(ctx, p.familyId, p.ownerId) };
}

/** One plan per provider thread. Order by provider receipt time, not webhook delivery order. */
export async function recordEmailPlans(ctx: MutationCtx, integration: Doc<'integrations'>, source: { messageId: string; threadId: string; at: number; label: string }, plans: EmailPlan[]) {
  const owner = integration.memberId;
  if (!owner) return;
  const prefs = await preferenceFor(ctx, integration.familyId, owner);
  if (!prefs?.enabled) return;
  const members = await ctx.db.query('members').withIndex('by_family', q => q.eq('familyId', integration.familyId)).collect();
  const previous = await ctx.db.query('mailPlans').withIndex('by_thread', q => q.eq('integrationId', integration._id).eq('threadId', source.threadId)).unique();
  if (previous && (previous.sourceMessageId === source.messageId || previous.sourceAt > source.at)) return;
  const first = plans[0];
  if (!first) return;
  const missing = [...first.missing];
  const participantIds: Id<'members'>[] = [owner];
  for (const name of first.participantNames) {
    const matches = members.filter(m => m.name.toLowerCase() === name.toLowerCase() && connectorAllowed(m));
    if (matches.length !== 1) { missing.push(`Confirm who “${name}” refers to.`); continue; }
    if (!participantIds.includes(matches[0]._id)) participantIds.push(matches[0]._id);
  }
  const now = await clock.now(ctx, integration.familyId);
  const isBusy = previous?.calendarOperation === 'running' || previous?.draftOperation === 'running';
  if (isBusy) missing.push('A calendar or draft action was already in progress. Review its result.');
  const status = missing.length || (first.intent === 'confirmed' && (first.durationAssumed || first.slots.length !== 1)) ? 'review' as const : first.intent;
  const fields = { sourceMessageId: source.messageId, sourceAt: source.at, sourceLabel: source.label,
    title: first.title, status, slots: first.slots, participantIds, missing, durationAssumed: first.durationAssumed,
    revision: (previous?.revision ?? 0) + 1, updatedAt: now };
  const id = previous?._id ?? await ctx.db.insert('mailPlans', { ...fields, familyId: integration.familyId, ownerId: owner, integrationId: integration._id, threadId: source.threadId, createdAt: now });
  if (previous) await ctx.db.patch(id, fields);
  let eventId = previous?.eventId;
  let ownsEvent = previous?.ownsEvent ?? false;
  // Only edit our own imported event, never an unrelated event matched from Google Calendar.
  if (eventId && ownsEvent && (status === 'cancelled' || (status === 'confirmed' && first.slots.length === 1))) {
    const e = await ctx.db.get(eventId);
    if (e?.scope === 'personal' && e.ownerId === owner) {
      if (status === 'cancelled') await ctx.db.patch(eventId, { cancelled: true });
      else await ctx.db.patch(eventId, { ...first.slots[0], title: first.title, cancelled: false });
    }
    if (previous?.calendarExternalId) {
      await ctx.db.patch(id, { calendarOperation: 'uncertain' });
      // A confirmation at the approved time or a cancellation can update that approved hold.
      if (status === 'cancelled' || (previous.selected?.start === first.slots[0]?.start && previous.selected?.end === first.slots[0]?.end)) await ctx.scheduler.runAfter(0, internal.scheduling.reconcileInternal, { planId: id, revision: fields.revision });
    }
  }
  if (status === 'confirmed' && prefs.autoCapture && first.slots.length === 1 && !first.durationAssumed && !eventId) {
    const slot = first.slots[0];
    const existing = await ctx.db.query('events').withIndex('by_family_start', q => q.eq('familyId', integration.familyId).eq('start', slot.start)).collect();
    const duplicate = existing.find(e => e.ownerId === owner && !e.cancelled && e.end === slot.end && e.title.trim().toLowerCase() === first.title.trim().toLowerCase());
    eventId = duplicate?._id ?? await ctx.db.insert('events', { familyId: integration.familyId, title: first.title, ...slot, who: [owner], ownerId: owner, createdBy: owner, source: 'gmail', integrationId: integration._id, externalId: `plan:${source.threadId}`, scope: 'personal', cancelled: false });
    ownsEvent = !duplicate;
  }
  await ctx.db.patch(id, { eventId, ownsEvent, ...(status === 'confirmed' && first.slots.length === 1 ? { selected: first.slots[0] } : {}) });
  if (!previous?.messageId) {
    const messageId = await postOwnMegaMessage(ctx, integration.familyId, owner, { type: 'card', card: { kind: 'mailPlan', planId: id } }, now);
    if (messageId) await ctx.db.patch(id, { messageId });
  }
  if (eventId && !previous?.eventId) {
    const event = await ctx.db.get(eventId);
    const family = await ctx.db.get(integration.familyId);
    if (event && family) await maybeSuggestEventShare(ctx, event, family.timezone, now);
  }
  await enqueueCardCandidate(ctx, { familyId: integration.familyId, recipientId: owner, kind: 'update',
    dedupeKey: `mailPlan:${id}:${fields.revision}`, title: COORDINATION_COPY.emailTitle, text: COORDINATION_COPY.emailBody,
    source: { kind: 'mailPlan', planId: id, revision: fields.revision }, now });
  await ctx.scheduler.runAfter(0, internal.scheduling.refreshInternal, { planId: id });
}
