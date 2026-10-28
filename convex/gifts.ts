// CONTRACT §4 `gifts.*` (GD, v0.13). Gift ideas from household-shared facts only, for adults only, never
// for the person they're about (convex/model/gifts.ts). `draft` is the internal Muse Spark step.
import { v } from 'convex/values';
import { GIFTS } from '../shared/config/calendar';
import { GIFT_LIST_NAME } from '../shared/config/copy';
import { LIMITS } from '../shared/config/limits';
import { API } from '../shared/domain/api';
import { localDate } from '../shared/time';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { pick } from './model/define';
import { searchWeb } from './search';
import { fail } from './model/errors';
import { canSeeGiftsFor, deliverGiftCards, nextBirthday, queueGiftIdeas, requireGiftViewer, sharedFactsFor } from './model/gifts';
import { callModel, parseJson } from './model/modelCall';
import { requireViewer, sameFamilyMember } from './model/viewer';
import { clock } from './ports/clock';

export const upcoming = query({
  ...pick(API.gifts.upcoming),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (!(GIFTS.viewers as readonly string[]).includes(viewer.member.role)) fail('FORBIDDEN', 'gift ideas are for grown-ups');
    const now = await clock.now(ctx, viewer.member.familyId);
    const today = localDate(now, viewer.family.timezone);
    const rows = await ctx.db
      .query('giftIdeas')
      .withIndex('by_family_for', (q) => q.eq('familyId', viewer.member.familyId))
      .collect();
    return rows.filter((g) => g.status === 'ready' && canSeeGiftsFor(viewer.member, g.forMemberId) && g.date >= today && nextBirthday(g.date, today).daysAway <= GIFTS.lookaheadDays);
  },
});

export const get = query({
  ...pick(API.gifts.get),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const set = await ctx.db.get(args.giftIdeasId);
    if (!set || set.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    requireGiftViewer(viewer.member, set.forMemberId);
    return set;
  },
});

export const generate = mutation({
  ...pick(API.gifts.generate),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireGiftViewer(viewer.member, args.forMemberId);
    const forMember = await sameFamilyMember(ctx, viewer.member.familyId, args.forMemberId);
    if (!forMember.birthday) fail('VALIDATION', 'add their birthday first');
    const now = await clock.now(ctx, viewer.member.familyId);
    const today = localDate(now, viewer.family.timezone);
    const { date } = nextBirthday(forMember.birthday, today);
    // G4 review (cost): at most one requested set per birthday person per day (each set runs
    // GIFTS.ideasPerSet product searches, outside the per-member search cap). A set someone asked for today
    // that hasn't failed is returned as is; Hub's automatic set (no `createdBy`) doesn't count.
    const madeToday = (
      await ctx.db
        .query('giftIdeas')
        .withIndex('by_family_for', (q) => q.eq('familyId', viewer.member.familyId).eq('forMemberId', forMember._id))
        .collect()
    ).find((g) => g.createdBy !== undefined && g.date === date && g.status !== 'failed' && localDate(g.createdAt, viewer.family.timezone) === today);
    if (madeToday) return { giftIdeasId: madeToday._id };
    const giftIdeasId = await queueGiftIdeas(ctx, { forMember, date, createdBy: viewer.member._id, now });
    return { giftIdeasId };
  },
});

export const addToList = mutation({
  ...pick(API.gifts.addToList),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const set = await ctx.db.get(args.giftIdeasId);
    if (!set || set.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    requireGiftViewer(viewer.member, set.forMemberId);
    const idea = set.ideas[args.index];
    if (!Number.isInteger(args.index) || !idea) fail('VALIDATION', 'no such idea');
    const familyId = viewer.member.familyId;
    const lists = await ctx.db
      .query('lists')
      .withIndex('by_family', (q) => q.eq('familyId', familyId))
      .collect();
    // An adults-scope list: the birthday kid (or any kid) never sees the gift list.
    const list = lists.find((l) => l.name === GIFT_LIST_NAME && l.scope === 'adults') ?? (await ctx.db.get(await ctx.db.insert('lists', { familyId, name: GIFT_LIST_NAME, scope: 'adults' })))!;
    const forMember = await ctx.db.get(set.forMemberId);
    const text = `${idea.title} (for ${forMember?.name ?? 'them'})`;
    const items = await ctx.db
      .query('listItems')
      .withIndex('by_family_list', (q) => q.eq('familyId', familyId).eq('listId', list._id))
      .collect();
    const already = items.find((i) => i.text === text);
    if (already) return already._id;
    const now = await clock.now(ctx, familyId);
    const itemId = await ctx.db.insert('listItems', { familyId, listId: list._id, text, checked: false, addedBy: viewer.member._id, at: now });
    if (!set.addedToList.includes(args.index)) await ctx.db.patch(set._id, { addedToList: [...set.addedToList, args.index] });
    return itemId;
  },
});

// ---------- the model step (internal) ----------

export const loadDraftContext = internalQuery({
  args: { giftIdeasId: v.id('giftIdeas') },
  returns: v.union(v.null(), v.object({ familyId: v.id('families'), name: v.string(), age: v.optional(v.number()), facts: v.array(v.string()) })),
  handler: async (ctx, args) => {
    const set = await ctx.db.get(args.giftIdeasId);
    if (!set || set.status !== 'queued') return null;
    const forMember = await ctx.db.get(set.forMemberId);
    if (!forMember) return null;
    const facts = await sharedFactsFor(ctx, forMember);
    const age = forMember.birthday ? Number(set.date.slice(0, 4)) - Number(forMember.birthday.slice(0, 4)) : undefined;
    return { familyId: set.familyId, name: forMember.name, age, facts: facts.map((f) => f.text) };
  },
});

const IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, why: { type: 'string' }, price: { type: 'string' }, basedOn: { type: 'array', items: { type: 'number' } } },
        required: ['title', 'why', 'price', 'basedOn'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
} as const;

export const draft = internalAction({
  args: { giftIdeasId: v.id('giftIdeas') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.gifts.loadDraftContext, { giftIdeasId: args.giftIdeasId });
    if (!data) return null;
    if (!data.facts.length) {
      await ctx.runMutation(internal.gifts.finish, { giftIdeasId: args.giftIdeasId, ideas: [] });
      return null;
    }
    let ideas: { title: string; why: string; price: string; basedOn: number[] }[] = [];
    try {
      const res = await callModel(ctx, data.familyId, {
        messages: [
          { role: 'system', content: `Suggest ${GIFTS.ideasPerSet} birthday gift ideas for ${data.name}${data.age ? `, turning ${data.age}` : ''}. Use ONLY the numbered facts below (things the family chose to share); every idea must cite at least one fact number in basedOn. Each title under 40 characters; "why" one short sentence; "price" a rough range like "$25" or "" if unsure. Kid-appropriate, no brand-name promises.` },
          { role: 'user', content: data.facts.map((f, i) => `${i}. ${f}`).join('\n') },
        ],
        schema: { name: 'giftIdeas', schema: IDEAS_SCHEMA, strict: true },
        maxTokens: LIMITS.agent.maxTokensStructured,
        effort: LIMITS.agent.effort,
      });
      ideas = parseJson<{ ideas: typeof ideas }>(res.text)?.ideas ?? [];
    } catch (e) {
      console.log(`[gifts] ${args.giftIdeasId}: model call failed (${e instanceof Error ? e.message : String(e)})`);
      await ctx.runMutation(internal.gifts.markFailed, { giftIdeasId: args.giftIdeasId });
      return null;
    }
    // G4: one product link per idea from web search. The query is the idea and the age only (built from
    // household-shared facts) — no name, no location. A failed search just leaves the idea without a link.
    const linked: (typeof ideas[number] & { url?: string })[] = [];
    for (const idea of ideas.slice(0, GIFTS.ideasPerSet)) {
      let url: string | undefined;
      if (GIFTS.productSearch && idea.title.trim()) {
        try {
          const r = await searchWeb(ctx, data.familyId, { query: `${idea.title.trim()} gift${data.age ? ` for a ${data.age}-year-old` : ''}`, contextSize: 'low' });
          url = r.ok ? r.sources.find((s) => /^https:\/\//.test(s.url))?.url : undefined;
        } catch (e) {
          console.log(`[gifts] ${args.giftIdeasId}: product search skipped (${e instanceof Error ? e.message : String(e)})`);
        }
      }
      linked.push({ ...idea, url });
    }
    await ctx.runMutation(internal.gifts.finish, { giftIdeasId: args.giftIdeasId, ideas: linked });
    return null;
  },
});

export const finish = internalMutation({
  args: { giftIdeasId: v.id('giftIdeas'), ideas: v.array(v.object({ title: v.string(), why: v.string(), price: v.string(), basedOn: v.array(v.number()), url: v.optional(v.string()) })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const set = await ctx.db.get(args.giftIdeasId);
    if (!set || set.status !== 'queued') return null;
    const forMember = await ctx.db.get(set.forMemberId);
    if (!forMember) return null;
    // Re-read the facts here (not trusting the action's copy) and keep only ideas that cite real ones.
    const facts = await sharedFactsFor(ctx, forMember);
    const ideas = args.ideas
      .map((i) => ({ title: i.title.trim().slice(0, 60), why: i.why.trim().slice(0, 160), price: i.price.trim().slice(0, 20) || undefined, url: i.url && /^https:\/\//.test(i.url) ? i.url.slice(0, 500) : undefined, basedOn: [...new Set(i.basedOn.filter((n) => Number.isInteger(n) && n >= 0 && n < facts.length))] }))
      .filter((i) => i.title && i.basedOn.length)
      .slice(0, GIFTS.ideasPerSet);
    const used = [...new Set(ideas.flatMap((i) => i.basedOn))].sort((a, b) => a - b);
    const remap = new Map(used.map((n, i) => [n, i]));
    const now = await clock.now(ctx, set.familyId);
    await ctx.db.patch(set._id, {
      basedOn: used.map((n) => facts[n].fact),
      ideas: ideas.map((i) => ({ ...i, basedOn: i.basedOn.map((n) => remap.get(n)!) })),
      status: ideas.length ? 'ready' : 'failed',
    });
    if (ideas.length) await deliverGiftCards(ctx, (await ctx.db.get(set._id))!, now);
    return null;
  },
});

export const markFailed = internalMutation({
  args: { giftIdeasId: v.id('giftIdeas') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const set = await ctx.db.get(args.giftIdeasId);
    if (set && set.status === 'queued') await ctx.db.patch(set._id, { status: 'failed' });
    return null;
  },
});
