// G5 sample-family additions (CONTRACT v0.17, docs/gates/G5.md): Admin's finished onboarding, a connected
// (synthetic) Gmail with one found item, and a team schedule link, so every G5 function has a row to read. No
// Google grant is seeded, so nothing real is ever polled for these rows.
import { SAMPLE_FAMILY as S, type SampleKey } from '../../shared/fixtures/sampleFamily';
import { localDateTimeToInstant } from '../../shared/time';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export async function seedG5(ctx: MutationCtx, p: { familyId: Id<'families'>; m: Record<SampleKey, Id<'members'>>; now: number; timezone: string }): Promise<void> {
  const { familyId, m, now, timezone } = p;
  const g = S.g5;

  await ctx.db.insert('onboarding', {
    familyId,
    memberId: m[g.onboardedBy],
    step: 'done',
    outcomes: { gmail: 'connected', calendar: 'skipped', ics: 'connected' },
    startedAt: now - 7 * 86_400_000,
    finishedAt: now - 7 * 86_400_000,
  });

  const gmailId = await ctx.db.insert('integrations', {
    familyId,
    memberId: m[g.gmail.owner],
    kind: 'gmail',
    config: {},
    status: 'connected',
    label: g.gmail.label,
    connectedAt: now - 7 * 86_400_000,
    lastSyncAt: now - 10 * 60_000,
  });
  await ctx.db.insert('integrations', {
    familyId,
    memberId: m[g.ics.owner],
    kind: 'ics',
    config: { url: g.ics.url },
    status: 'connected',
    label: g.ics.label,
    host: g.ics.host,
    connectedAt: now - 7 * 86_400_000,
    lastSyncAt: now - 20 * 60_000,
  });

  const owner = m[g.gmail.owner];
  const start = localDateTimeToInstant(`${g.found.date}T00:00`, timezone);
  const eventId = await ctx.db.insert('events', {
    familyId,
    title: g.found.title,
    start,
    allDay: g.found.date,
    who: [owner],
    source: 'gmail',
    externalId: `${g.found.gmailMessageId}#0`,
    integrationId: gmailId,
    createdBy: owner,
    ownerId: owner,
    scope: 'personal',
    cancelled: false,
  });
  await ctx.db.insert('mailItems', {
    familyId,
    memberId: owner,
    integrationId: gmailId,
    gmailMessageId: g.found.gmailMessageId,
    itemIndex: 0,
    kind: 'event',
    title: g.found.title,
    sourceLabel: g.found.sourceLabel,
    when: g.found.date,
    eventId,
    status: 'added',
    foundAt: now - 7 * 86_400_000,
    decidedBy: 'rule:seed',
  });
}
