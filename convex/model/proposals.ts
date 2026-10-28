// GD (CONTRACT v0.13): clash proposals. Pending until the Admin decides (invariant 4: nothing changes until
// approved). An approval is refused if the proposal isn't pending, has expired, the family's membership
// changed since it was made (OpenDuet learning: an approval is scoped to its audience), or the event it
// would change has been edited since (its "before" no longer matches).
import { CLASH } from '../../shared/config/calendar';
import { GD_PUSH_COPY, PROPOSAL_DISCLOSURE, fillCopy } from '../../shared/config/copy';
import { proposalDedupeKey } from '../../shared/config/proactive';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';
import { patchEvent } from './eventWrites';
import { enqueueCardCandidate } from './proactive';

const MINUTE = 60_000;

async function familyMegaOf(ctx: QueryCtx | MutationCtx, familyId: Id<'families'>): Promise<Doc<'megas'> | null> {
  const megas = await ctx.db
    .query('megas')
    .withIndex('by_family_owner', (q) => q.eq('familyId', familyId))
    .collect();
  return megas.find((m) => m.kind === 'family') ?? null;
}

async function memberIdsOf(ctx: QueryCtx | MutationCtx, familyId: Id<'families'>): Promise<Id<'members'>[]> {
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', familyId))
    .collect();
  return members.map((m) => m._id).sort();
}

/** Writes a pending proposal and sends each approver (config CLASH.approverRole) a proposal card from Hub.
 * Shared by `clashes.createProposal` (after the model calls) and the seed (the board's proposal). */
export async function insertProposal(
  ctx: MutationCtx,
  params: {
    collision: Doc<'collisions'>;
    fix: Doc<'proposals'>['fix'];
    title: string;
    text: string;
    wordedBy: Doc<'proposals'>['wordedBy'];
    reasonedBy: Doc<'proposals'>['reasonedBy'];
    now: number;
  },
): Promise<Id<'proposals'> | null> {
  const { collision, fix, now } = params;
  const event = await ctx.db.get(fix.eventId);
  const hub = await familyMegaOf(ctx, collision.familyId);
  if (!event || !hub) return null;
  const events = (await Promise.all(collision.eventIds.map((id) => ctx.db.get(id)))).filter((e): e is Doc<'events'> => !!e);
  const firstStart = Math.min(...events.map((e) => e.start));
  const before = { eventId: event._id, title: event.title, start: event.start, end: event.end, who: event.who };
  const after = fix.kind === 'reassign' ? { ...before, who: event.who.map((id) => (id === fix.from ? fix.to : id)) } : { ...before, start: fix.start, end: fix.end };
  const audience = await memberIdsOf(ctx, collision.familyId);
  const proposalId = await ctx.db.insert('proposals', {
    familyId: collision.familyId,
    collisionId: collision._id,
    megaId: hub._id,
    fix,
    title: params.title,
    text: params.text,
    before,
    after,
    wordedBy: params.wordedBy,
    reasonedBy: params.reasonedBy,
    audience,
    status: 'pending',
    createdAt: now,
    expiresAt: Math.min(now + CLASH.expireAfterHours * 60 * MINUTE, firstStart),
  });
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', collision.familyId))
    .collect();
  for (const approver of members.filter((m) => m.role === CLASH.approverRole)) {
    await enqueueCardCandidate(ctx, {
      familyId: collision.familyId,
      recipientId: approver._id,
      kind: 'update',
      dedupeKey: proposalDedupeKey(proposalId, approver._id),
      title: fillCopy(GD_PUSH_COPY.proposal.title, { title: params.title }),
      text: fillCopy(GD_PUSH_COPY.proposal.text, { text: params.text }),
      source: { kind: 'proposal', proposalId },
      now,
    });
  }
  return proposalId;
}

/** Whether the event is still what the proposal was made on. People are compared as a set (GD review): a
 * reorder of the same people is not a change. */
export function sameSnapshot(event: Doc<'events'>, snap: Doc<'proposals'>['before']): boolean {
  const samePeople = event.who.length === snap.who.length && event.who.every((id) => snap.who.includes(id));
  return event.title === snap.title && event.start === snap.start && event.end === snap.end && samePeople;
}

/** The Admin's decision. Approve applies the fix through `patchEvent` (the same path as `events.update`) and
 * tells the adults it moved; reject changes nothing. Throws VALIDATION (and changes nothing) when refused. */
export async function decideProposal(ctx: MutationCtx, params: { proposalId: Id<'proposals'>; approver: Doc<'members'>; approve: boolean; now: number }): Promise<void> {
  const { approver, now } = params;
  const proposal = await ctx.db.get(params.proposalId);
  if (!proposal || proposal.familyId !== approver.familyId) fail('NOT_FOUND');
  if (approver.role !== CLASH.approverRole) fail('FORBIDDEN', 'only the Admin approves a fix');
  if (proposal.status !== 'pending') fail('VALIDATION', 'that proposal was already decided');
  if (now > proposal.expiresAt) fail('VALIDATION', 'that proposal has expired');
  const audience = await memberIdsOf(ctx, proposal.familyId);
  if (audience.length !== proposal.audience.length || audience.some((id, i) => id !== proposal.audience[i])) fail('VALIDATION', 'the family changed since this was proposed');

  const decision = { byId: approver._id, at: now, approve: params.approve, audience };
  if (!params.approve) {
    await ctx.db.patch(proposal._id, { status: 'rejected', decision });
    await ctx.db.patch(proposal.collisionId, { status: 'dismissed' });
    return;
  }

  const event = await ctx.db.get(proposal.fix.eventId);
  if (!event || event.cancelled || !sameSnapshot(event, proposal.before)) fail('VALIDATION', 'the calendar changed since this was proposed');
  await ctx.db.patch(proposal._id, { status: 'approved', decision });
  await ctx.db.patch(proposal.collisionId, { status: 'resolved' });
  const patch = proposal.fix.kind === 'reassign' ? { who: proposal.after.who } : { start: proposal.after.start, end: proposal.after.end };
  await patchEvent(ctx, event, patch, now);

  // Tell the adults the fix moved (each from their own MEGA, e.g. Coral tells Partner) — not the approver.
  const affected = new Set<Id<'members'>>(proposal.fix.kind === 'reassign' ? [proposal.fix.from, proposal.fix.to] : event.who);
  const approverName = approver.name;
  for (const memberId of affected) {
    if (memberId === approver._id) continue;
    const member = await ctx.db.get(memberId);
    if (!member || member.role === 'kid') continue;
    await enqueueCardCandidate(ctx, {
      familyId: proposal.familyId,
      recipientId: memberId,
      kind: 'update',
      dedupeKey: proposalDedupeKey(proposal._id, memberId),
      title: GD_PUSH_COPY.proposalApplied.title,
      text: fillCopy(GD_PUSH_COPY.proposalApplied.text, { title: proposal.title, by: approverName }),
      source: { kind: 'proposal', proposalId: proposal._id },
      now,
    });
  }
}

/** Expires pending proposals past their time, and marks stale ones whose family membership changed (run by
 * the sweep, since a refused `decide` can't persist anything — it throws). */
export async function sweepProposals(ctx: MutationCtx, familyId: Id<'families'>, now: number): Promise<void> {
  const pending = await ctx.db
    .query('proposals')
    .withIndex('by_family_status', (q) => q.eq('familyId', familyId).eq('status', 'pending'))
    .collect();
  if (!pending.length) return;
  const audience = await memberIdsOf(ctx, familyId);
  for (const p of pending) {
    if (now > p.expiresAt) await ctx.db.patch(p._id, { status: 'expired' });
    else if (audience.length !== p.audience.length || audience.some((id, i) => id !== p.audience[i])) await ctx.db.patch(p._id, { status: 'stale' });
  }
}

/** `proposals.open` / `.get`'s view: the proposal, Hub's badge and the AI disclosure line. */
export async function proposalViewOf(ctx: QueryCtx | MutationCtx, proposal: Doc<'proposals'>) {
  const mega = (await ctx.db.get(proposal.megaId))!;
  const collision = await ctx.db.get(proposal.collisionId);
  return {
    clashEventIds: collision?.eventIds ?? [proposal.fix.eventId],
    proposal,
    mega: { megaId: mega._id, name: mega.name, hex: mega.look.hex, sticker: mega.look.sticker },
    disclosure: PROPOSAL_DISCLOSURE.replace('{mega}', mega.name),
  };
}
