// GD (CONTRACT v0.13): the Mega Bucks ledger (invariant 6). A kid's balance is the sum of their ledger rows,
// never stored. Only an adult's release adds (+), only the kid's own purchase spends (−), at most one release
// per practice set or chore claim, and a balance never goes below zero.
import { GD_PUSH_COPY, fillCopy } from '../../shared/config/copy';
import { bucksDedupeKey } from '../../shared/config/proactive';
import { MEGA_BUCKS } from '../../shared/config/store';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';
import { enqueueCardCandidate } from './proactive';
import { sameFamilyMember } from './viewer';

type Ctx = QueryCtx | MutationCtx;

export async function ledgerOf(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>): Promise<Doc<'bucksLedger'>[]> {
  return ctx.db
    .query('bucksLedger')
    .withIndex('by_family_member_at', (q) => q.eq('familyId', familyId).eq('memberId', memberId))
    .collect();
}

export async function balanceOf(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>): Promise<number> {
  return (await ledgerOf(ctx, familyId, memberId)).reduce((sum, r) => sum + r.delta, 0);
}

/** The kid whose balance a caller may read: a kid → only themselves; an adult → any kid in the family (or
 * themselves, whose balance is just 0). */
export async function bucksSubject(ctx: Ctx, viewer: { member: Doc<'members'> }, memberId: Id<'members'> | undefined): Promise<Id<'members'>> {
  if (!memberId || memberId === viewer.member._id) return viewer.member._id;
  if (viewer.member.role === 'kid') fail('FORBIDDEN', 'you can only see your own Mega Bucks');
  const target = await sameFamilyMember(ctx, viewer.member.familyId, memberId);
  if (target.role !== 'kid') fail('VALIDATION', 'only kids have Mega Bucks');
  return target._id;
}

export type BucksSource = { kind: 'practice'; setId: Id<'practiceSets'> } | { kind: 'chore'; claimId: Id<'choreClaims'> } | { kind: 'bonus'; memberId: Id<'members'> };

function sameSource(row: Doc<'bucksLedger'>, source: BucksSource): boolean {
  if (source.kind === 'practice') return row.source.kind === 'practice' && row.source.setId === source.setId;
  if (source.kind === 'chore') return row.source.kind === 'chore' && row.source.claimId === source.claimId;
  return false; // a bonus is never deduped
}

/** An adult releases Mega Bucks for a finished practice set, a claimed chore, or as a bonus. Idempotent per
 * practice set / chore claim: a second release returns the first ledger row unchanged. Approving a claimed
 * chore is this release. Sends the kid a bucks card. */
export async function releaseBucks(ctx: MutationCtx, params: { adult: Doc<'members'>; source: BucksSource; amount: number; now: number }): Promise<{ ledgerId: Id<'bucksLedger'>; balance: number }> {
  const { adult, source, now } = params;
  if (!(MEGA_BUCKS.releasers as readonly string[]).includes(adult.role)) fail('FORBIDDEN', 'only a grown-up can release Mega Bucks');
  if (!Number.isInteger(params.amount) || params.amount < MEGA_BUCKS.minRelease || params.amount > MEGA_BUCKS.maxRelease) fail('VALIDATION', `release between ${MEGA_BUCKS.minRelease} and ${MEGA_BUCKS.maxRelease}`);
  const familyId = adult.familyId;

  let kidId: Id<'members'>;
  let ledgerSource: Doc<'bucksLedger'>['source'];
  let claim: Doc<'choreClaims'> | null = null;
  if (source.kind === 'practice') {
    const set = await ctx.db.get(source.setId);
    if (!set || set.familyId !== familyId) fail('NOT_FOUND');
    if (set.status !== 'done') fail('VALIDATION', 'that practice isn’t finished yet');
    kidId = set.forMemberId;
    ledgerSource = { kind: 'practice', setId: set._id };
  } else if (source.kind === 'chore') {
    claim = await ctx.db.get(source.claimId);
    if (!claim || claim.familyId !== familyId) fail('NOT_FOUND');
    kidId = claim.forMemberId;
    ledgerSource = { kind: 'chore', claimId: claim._id };
  } else {
    const kid = await sameFamilyMember(ctx, familyId, source.memberId);
    if (kid.role !== 'kid') fail('VALIDATION', 'only kids get Mega Bucks');
    kidId = kid._id;
    ledgerSource = { kind: 'bonus' };
  }

  const rows = await ledgerOf(ctx, familyId, kidId);
  const prior = rows.find((r) => sameSource(r, source));
  if (prior) return { ledgerId: prior._id, balance: rows.reduce((s, r) => s + r.delta, 0) };
  if (claim && claim.status !== 'claimed') fail('VALIDATION', 'that chore isn’t marked done');

  const ledgerId = await ctx.db.insert('bucksLedger', { familyId, memberId: kidId, delta: params.amount, source: ledgerSource, byId: adult._id, at: now });
  if (claim) await ctx.db.patch(claim._id, { status: 'approved', decidedById: adult._id, decidedAt: now });
  const balance = rows.reduce((s, r) => s + r.delta, 0) + params.amount;
  const copy = GD_PUSH_COPY.bucksReleased;
  await enqueueCardCandidate(ctx, {
    familyId,
    recipientId: kidId,
    kind: 'reminder', // the one kind kids receive (NOTIFICATION_KINDS_CONFIG.reminder.kidsGetIt)
    dedupeKey: bucksDedupeKey(ledgerId),
    title: fillCopy(copy.title, { bucks: params.amount }),
    text: fillCopy(copy.text, { by: adult.name, bucks: params.amount, balance }),
    source: { kind: 'bucks', ledgerId },
    buttons: 'tip.default', // no buttons on a celebration
    now,
  });
  return { ledgerId, balance };
}
