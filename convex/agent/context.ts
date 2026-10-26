// Builds one turn's context (PLAN.md → Global memory, "Each turn's context is: 1. profile card, 2. pinned
// family facts, 3. text-search hits ... 4. next 7 days ... 5. recent thread, 6. a recall tool"). An
// internalQuery because the agent loop runs as an action and has no direct `ctx.db` — it calls this through
// `ctx.runQuery`.
import { v } from 'convex/values';
import { LIMITS } from '../../shared/config';
import type { Viewer } from '../../shared/domain/api';
import { formatLocalDateTime } from '../../shared/time';
import type { Doc, Id } from '../_generated/dataModel';
import { internalQuery } from '../_generated/server';
import { eventsInRange, visibleLists } from '../model/home';
import { pinnedFacts, recall } from '../model/recall';
import { clock } from '../ports/clock';

const DAY_MS = 24 * 60 * 60_000;
const RECENT_THREAD_MESSAGES = 12;

function summarizeBody(body: Doc<'messages'>['body']): string {
  switch (body.type) {
    case 'text':
      return body.text;
    case 'block': {
      // Every block kind the agent loop can actually show (convex/agent/tools.ts `validateUiBlock`) has a
      // `prompt`; `invite`/`look`/`questions` are app-driven blocks the loop never emits, but the shared
      // `UIBlock` union still includes them, so this stays exhaustive instead of assuming `prompt` exists.
      const prompt = 'prompt' in body.block ? body.block.prompt : body.block.kind;
      return `[showed a "${body.block.kind}" prompt: ${prompt}]${body.answeredWith ? ' (answered)' : ''}`;
    }
    case 'answer':
      return `answered: ${body.label}`;
    case 'card':
      return `[${body.card.kind} card]`;
    case 'image':
      return '[image attached]';
    case 'notice':
      return body.text;
  }
}

/** A minimal stand-in for `Viewer`, built from ids the caller already has (no identity lookup — this runs
 * inside a scheduled action with no signed-in caller; see convex/chat.ts's generateReply). Only the fields
 * `eventsInRange`/`visibleLists` actually read are filled in. */
function viewerLike(familyId: Id<'families'>, memberId: Id<'members'>, role: Doc<'members'>['role']): Viewer {
  return { member: { _id: memberId, familyId, role } } as unknown as Viewer;
}

export const buildContext = internalQuery({
  args: { familyId: v.id('families'), memberId: v.id('members'), megaId: v.optional(v.id('megas')), threadId: v.id('threads'), userText: v.string() },
  returns: v.object({
    now: v.string(),
    roster: v.array(v.object({ memberId: v.id('members'), name: v.string(), role: v.string() })),
    mega: v.union(v.object({ name: v.string(), personality: v.string() }), v.null()),
    profileCard: v.string(),
    pinnedFacts: v.array(v.string()),
    searchHits: v.array(v.string()),
    upcomingEvents: v.array(v.string()),
    upcomingReminders: v.array(v.string()),
    lists: v.array(v.string()),
    recentThread: v.array(v.object({ role: v.union(v.literal('user'), v.literal('assistant')), content: v.string() })),
  }),
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member || member.familyId !== args.familyId) throw new Error('agent/context: member not in family');
    const viewer = viewerLike(args.familyId, args.memberId, member.role);
    const family = await ctx.db.get(args.familyId);
    if (!family) throw new Error('agent/context: family not found');
    const tz = family.timezone;

    const roster = (
      await ctx.db
        .query('members')
        .withIndex('by_family', (q) => q.eq('familyId', args.familyId))
        .collect()
    ).map((m) => ({ memberId: m._id, name: m.name, role: m.role }));

    const megaDoc = args.megaId ? await ctx.db.get(args.megaId) : null;
    const mega = megaDoc ? { name: megaDoc.name, personality: megaDoc.personality } : null;

    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_family_member', (q) => q.eq('familyId', args.familyId).eq('memberId', args.memberId))
      .unique();
    const profileCard = profile
      ? [
          `Call them ${profile.callMe}.`,
          ...Object.entries(profile.basics).map(([k, v]) => `${k}: ${v}`),
          ...profile.routines.filter((r) => r.confirmed).map((r) => r.text),
        ].join(' ')
      : `${member.name} (${member.role}).`;

    const now = await clock.now(ctx, args.familyId);
    const [facts, hits, events, lists] = await Promise.all([
      pinnedFacts(ctx, args.familyId, args.memberId, member.role),
      recall(ctx, args.familyId, args.memberId, member.role, args.userText),
      eventsInRange(ctx, viewer, now, now + LIMITS.contextDays * DAY_MS),
      visibleLists(ctx, viewer),
    ]);
    const reminders = await ctx.db
      .query('reminders')
      .withIndex('by_family_member_due', (q) => q.eq('familyId', args.familyId).eq('forMemberId', args.memberId).gte('dueAt', now).lte('dueAt', now + LIMITS.contextDays * DAY_MS))
      .collect();

    const thread = await ctx.db
      .query('messages')
      .withIndex('by_family_thread_at', (q) => q.eq('familyId', args.familyId).eq('threadId', args.threadId))
      .order('desc')
      .take(RECENT_THREAD_MESSAGES);

    const nameOf = (id: Id<'members'>) => roster.find((m) => m.memberId === id)?.name;
    const eventLine = (e: Doc<'events'>) => {
      const who = e.who.map(nameOf).filter((n): n is string => !!n);
      return `${formatLocalDateTime(e.start, tz, { weekday: 'short' })} — ${e.title}${who.length ? ` (${who.join(', ')})` : ''}`;
    };

    return {
      now: `${formatLocalDateTime(now, tz)} (${tz})`,
      roster,
      mega,
      profileCard,
      pinnedFacts: facts,
      searchHits: hits.map((h) => h.text),
      upcomingEvents: events.map(eventLine),
      upcomingReminders: reminders.filter((r) => !r.done).map((r) => `${r.text} (due ${formatLocalDateTime(r.dueAt, tz, { weekday: 'short' })})`),
      lists: lists.map((l) => `${l.list.name}: ${l.items.map((i) => (i.checked ? `~~${i.text}~~` : i.text)).join(', ')}`),
      recentThread: thread
        .reverse()
        .filter((m) => m.author.kind !== 'system')
        .map((m) => ({ role: m.author.kind === 'member' ? ('user' as const) : ('assistant' as const), content: summarizeBody(m.body) })),
    };
  },
});
