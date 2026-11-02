// GD (CONTRACT v0.13): calendar layers and the explicit-share rule (owner, Oct 26). The ONLY code that moves
// anything from a private layer to the household layer is `shareItem`, and its only callers are the owner's
// own `events.share` and `shareSuggestions.answer(share: true)` — both check the caller IS the owner first.
// No model output, trigger, rule or other member reaches it. Every move writes a `shareActions` row in the
// same mutation. Suggestions (`suggestShare`) never change anything by themselves.
import { memberAgeGroup } from './memberAge';
import { COORDINATION_COPY } from '../../shared/config/scheduling';
import { clock } from '../ports/clock';
import { canSeeEvent } from './visibility';
import { CLASH, SHARE_TO_SCOPE } from '../../shared/config/calendar';
import { GD_PUSH_COPY, fillCopy } from '../../shared/config/copy';
import { shareSuggestionDedupeKey } from '../../shared/config/proactive';
import type { DecidedBy } from '../../shared/domain/tables';
import { formatLocalTime, formatLocalWeekday } from '../../shared/time';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { fail } from './errors';
import { enqueueCardCandidate } from './proactive';
import { scopeKey } from './scopes';
import { eventOwnerId, layerOf } from './visibility';

type ShareItem = { kind: 'event'; eventId: Id<'events'> } | { kind: 'memory'; memoryId: Id<'memories'> };

/** The owner of a memory's private layer (a `personal` memory's scopeKey names its member). */
export function personalMemoryOwner(familyId: Id<'families'>, memory: Pick<Doc<'memories'>, 'scope' | 'scopeKey'>): Id<'members'> | null {
  if (memory.scope !== 'personal') return null;
  const prefix = `${familyId}:personal:`;
  return memory.scopeKey.startsWith(prefix) ? (memory.scopeKey.slice(prefix.length) as Id<'members'>) : null;
}

/** Moves one of `ownerId`'s private items to the household layer and records it. Callers MUST have already
 * established that the signed-in caller is `ownerId` (this is the structural choke point, so it re-checks). */
export async function shareItem(ctx: MutationCtx, params: { familyId: Id<'families'>; ownerId: Id<'members'>; item: ShareItem; now: number; suggestionId?: Id<'shareSuggestions'> }): Promise<void> {
  if (params.item.kind === 'event') {
    const event = await ctx.db.get(params.item.eventId);
    if (!event || event.familyId !== params.familyId) fail('NOT_FOUND');
    if (layerOf(event) !== 'private') fail('VALIDATION', 'that event is already on the household calendar');
    if (eventOwnerId(event) !== params.ownerId) fail('FORBIDDEN', 'only its owner can share it');
    await ctx.db.patch(event._id, { scope: SHARE_TO_SCOPE, ownerId: params.ownerId });
    await ctx.db.insert('shareActions', { familyId: params.familyId, ownerId: params.ownerId, item: params.item, action: 'share', fromScope: event.scope, toScope: SHARE_TO_SCOPE, at: params.now, suggestionId: params.suggestionId });
    await notifyParentsOfTeenEvent(ctx, { ...event, scope: SHARE_TO_SCOPE, ownerId: params.ownerId }, params.now);
    return;
  }
  const memory = await ctx.db.get(params.item.memoryId);
  if (!memory || memory.familyId !== params.familyId) fail('NOT_FOUND');
  if (personalMemoryOwner(params.familyId, memory) !== params.ownerId) fail('FORBIDDEN', 'only its owner can share it');
  await ctx.db.patch(memory._id, { scope: SHARE_TO_SCOPE, scopeKey: scopeKey(params.familyId, { scope: 'family' }) });
  await ctx.db.insert('shareActions', { familyId: params.familyId, ownerId: params.ownerId, item: params.item, action: 'share', fromScope: memory.scope, toScope: SHARE_TO_SCOPE, at: params.now, suggestionId: params.suggestionId });
}

/** Moves an event the owner shared back to their private layer. Only an event this owner shared (a prior
 * `share` action by them) can be unshared — never a household event someone else put there. */
export async function unshareEvent(ctx: MutationCtx, params: { familyId: Id<'families'>; ownerId: Id<'members'>; eventId: Id<'events'>; now: number }): Promise<void> {
  const event = await ctx.db.get(params.eventId);
  if (!event || event.familyId !== params.familyId) fail('NOT_FOUND');
  if (layerOf(event) !== 'household') fail('VALIDATION', 'that event is already private');
  const actions = await ctx.db
    .query('shareActions')
    .withIndex('by_family_owner', (q) => q.eq('familyId', params.familyId).eq('ownerId', params.ownerId))
    .collect();
  const sharedByOwner = actions.some((a) => a.item.kind === 'event' && a.item.eventId === event._id && a.action === 'share');
  if (!sharedByOwner || eventOwnerId(event) !== params.ownerId) fail('FORBIDDEN', 'only the person who shared it can take it back');
  await ctx.db.patch(event._id, { scope: 'personal', ownerId: params.ownerId });
  await ctx.db.insert('shareActions', { familyId: params.familyId, ownerId: params.ownerId, item: { kind: 'event', eventId: event._id }, action: 'unshare', fromScope: event.scope, toScope: 'personal', at: params.now });
}

/** What the household would see if it were shared ("Dentist · Thu 4:00–5:00 PM"), written from the item. */
export function eventPreview(event: Pick<Doc<'events'>, 'title' | 'start' | 'end'>, tz: string): string {
  const day = formatLocalWeekday(event.start, tz);
  const range = event.end ? `${formatLocalTime(event.start, tz)}–${formatLocalTime(event.end, tz)}` : formatLocalTime(event.start, tz);
  return `${event.title} · ${day} ${range}`;
}

/** Asks the owner (and only the owner) "Share it with the household?". Never changes the item. One pending
 * suggestion per item. Returns the suggestion id, or null if one was already pending. */
export async function suggestShare(
  ctx: MutationCtx,
  params: { familyId: Id<'families'>; ownerId: Id<'members'>; item: ShareItem; preview: string; decidedBy: DecidedBy; now: number },
): Promise<Id<'shareSuggestions'> | null> {
  const pending = await ctx.db
    .query('shareSuggestions')
    .withIndex('by_family_owner_status', (q) => q.eq('familyId', params.familyId).eq('ownerId', params.ownerId).eq('status', 'pending'))
    .collect();
  const sameItem = (s: Doc<'shareSuggestions'>) =>
    s.item.kind === params.item.kind && (s.item.kind === 'event' ? s.item.eventId === (params.item as { eventId?: string }).eventId : s.item.memoryId === (params.item as { memoryId?: string }).memoryId);
  if (pending.some(sameItem)) return null;
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', params.familyId))
    .collect();
  const suggestionId = await ctx.db.insert('shareSuggestions', {
    familyId: params.familyId,
    ownerId: params.ownerId,
    item: params.item,
    preview: params.preview,
    audience: members.filter((m) => m._id !== params.ownerId).map((m) => m._id),
    status: 'pending',
    createdAt: params.now,
    decidedBy: params.decidedBy,
  });
  const copy = GD_PUSH_COPY.shareSuggestion;
  await enqueueCardCandidate(ctx, {
    familyId: params.familyId,
    recipientId: params.ownerId,
    kind: 'update',
    dedupeKey: shareSuggestionDedupeKey(suggestionId),
    title: copy.title,
    text: fillCopy(copy.text, { preview: params.preview }),
    source: { kind: 'shareSuggestion', suggestionId },
    now: params.now,
  });
  return suggestionId;
}

/** The rule behind an event share suggestion (OpenDuet: rules may suggest, never act): a private event that
 * overlaps a household event someone in the family is in. Uses only the owner's own private event, and
 * only to ask the owner. Recorded as `rule:privateOverlapsHousehold`. */
export async function maybeSuggestEventShare(ctx: MutationCtx, event: Doc<'events'>, tz: string, now: number): Promise<void> {
  const ownerId = eventOwnerId(event);
  if (!ownerId || layerOf(event) !== 'private' || event.cancelled) return;
  const end = event.end ?? event.start;
  const nearby = await ctx.db
    .query('events')
    .withIndex('by_family_start', (q) => q.eq('familyId', event.familyId).gte('start', event.start - 24 * 60 * 60_000).lte('start', end))
    .collect();
  const overlaps = nearby.some(
    (e) => e._id !== event._id && !e.cancelled && layerOf(e) === 'household' && e.start < end && (e.end ?? e.start) > event.start && (e.end ?? e.start) - e.start >= CLASH.minOverlapMinutes * 60_000,
  );
  const owner = await ctx.db.get(ownerId);
  const teenEvent = !!owner && (await memberAgeGroup(ctx, owner)) === 'teen' && event.start > now;
  if (!overlaps && !teenEvent) return;
  if (teenEvent) {
    // Re-syncing or editing an event must not ask again after a decision.
    const prior = await ctx.db.query('shareSuggestions').withIndex('by_family_owner_status', q => q.eq('familyId', event.familyId).eq('ownerId', ownerId)).collect();
    if (prior.some(s => s.item.kind === 'event' && s.item.eventId === event._id)) return;
  }
  await suggestShare(ctx, { familyId: event.familyId, ownerId, item: { kind: 'event', eventId: event._id }, preview: eventPreview(event, tz), decidedBy: teenEvent ? 'rule:teenCalendarShare' : 'rule:privateOverlapsHousehold', now });
}

/** Only shared future events go to actual parents. Availability grants do not disclose event details. */
export async function notifyParentsOfTeenEvent(ctx: MutationCtx, event: Doc<'events'>, now: number): Promise<void> {
  const ownerId = eventOwnerId(event);
  const owner = ownerId ? await ctx.db.get(ownerId) : null;
  if (!owner || event.cancelled || event.start <= now || (await memberAgeGroup(ctx, owner)) !== 'teen') return;
  const relations = await ctx.db.query('relationships').withIndex('by_family_from', q => q.eq('familyId', event.familyId)).collect();
  for (const parentId of new Set(relations.filter(r => r.kind === 'parent' && r.to === owner._id).map(r => r.from))) {
    const parent = await ctx.db.get(parentId);
    if (!parent || parent.role === 'kid' || !canSeeEvent({ memberId: parentId, role: parent.role }, event)) continue;
    await enqueueCardCandidate(ctx, { familyId: event.familyId, recipientId: parentId, kind: 'update',
      dedupeKey: `teenCalendar:${event._id}:${event.start}:${parentId}`, title: COORDINATION_COPY.parentTitle,
      text: COORDINATION_COPY.parentBody(owner.name), source: { kind: 'teenCalendar', eventId: event._id, start: event.start }, now });
  }
}
