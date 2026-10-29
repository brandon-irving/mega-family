// CONTRACT §4 `routines.*` (GD, v0.13): a kid's morning and bedtime checklists (convex/model/routines.ts),
// plus `prepBedtime`, the internal step that turns tomorrow's household events into bedtime items.
import { v } from 'convex/values';
import { ROUTINES } from '../shared/config/kids';
import { LIMITS } from '../shared/config/limits';
import { HOLIDAYS } from '../shared/config/shopping';
import { API } from '../shared/domain/api';
import { formatLocalDateTime, localDate } from '../shared/time';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { callModel, parseJson } from './model/modelCall';
import { deliverRoutineCard, routineOf, routineSubject, runFor, tomorrowsHouseholdEventsFor } from './model/routines';
import { requireViewer } from './model/viewer';
import { layerOf } from './model/visibility';
import { validateSchedule } from './model/chores';
import { clock } from './ports/clock';

export const today = query({
  ...pick(API.routines.today),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const memberId = await routineSubject(ctx, viewer, args.memberId);
    const now = await clock.now(ctx, viewer.member.familyId);
    return runFor(ctx, viewer.member.familyId, memberId, args.kind, localDate(now, viewer.family.timezone));
  },
});

export const get = query({
  ...pick(API.routines.get),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const memberId = await routineSubject(ctx, viewer, args.memberId);
    return routineOf(ctx, viewer.member.familyId, memberId, args.kind);
  },
});

export const run = query({
  ...pick(API.routines.run),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const r = await ctx.db.get(args.runId);
    if (!r || r.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    await routineSubject(ctx, viewer, r.memberId); // the kid themselves, or one of their parents
    return r;
  },
});

export const check = mutation({
  ...pick(API.routines.check),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run || run.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (run.memberId !== viewer.member._id) fail('FORBIDDEN', 'only you can check your list');
    if (!run.steps.some((s) => s.id === args.stepId)) fail('VALIDATION', 'no such step');
    const steps = run.steps.map((s) => (s.id === args.stepId ? { ...s, done: args.done } : s));
    const now = await clock.now(ctx, viewer.member.familyId);
    await ctx.db.patch(run._id, { steps, finishedAt: steps.every((s) => s.done) ? (run.finishedAt ?? now) : undefined });
    return null;
  },
});

export const set = mutation({
  ...pick(API.routines.set),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role === 'kid') fail('FORBIDDEN', 'a parent sets this');
    const memberId = await routineSubject(ctx, viewer, args.memberId);
    validateSchedule(args.days, args.time);
    if (!args.steps.length || args.steps.some((s) => !s.id.trim() || !s.label.trim())) fail('VALIDATION', 'every step needs an id and a label');
    if (new Set(args.steps.map((s) => s.id)).size !== args.steps.length) fail('VALIDATION', 'step ids must be unique');
    const existing = await routineOf(ctx, viewer.member.familyId, memberId, args.kind);
    const fields = { steps: args.steps, time: args.time, days: args.days, updatedBy: viewer.member._id };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert('routines', { familyId: viewer.member.familyId, memberId, kind: args.kind, ...fields });
    return null;
  },
});

// ---------- bedtime prep (internal) ----------

export const loadBedtimeContext = internalQuery({
  args: { runId: v.id('routineRuns') },
  returns: v.union(
    v.null(),
    v.object({ familyId: v.id('families'), kidName: v.string(), events: v.array(v.object({ id: v.id('events'), title: v.string(), when: v.string(), place: v.optional(v.string()) })) }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.kind !== 'bedtime') return null;
    const kid = await ctx.db.get(run.memberId);
    const family = await ctx.db.get(run.familyId);
    if (!kid || !family) return null;
    const events = await tomorrowsHouseholdEventsFor(ctx, kid, family.timezone, run.date);
    return { familyId: run.familyId, kidName: kid.name, events: events.map((e) => ({ id: e._id, title: e.title, when: formatLocalDateTime(e.start, family.timezone, { weekday: 'short' }), place: e.place })) };
  },
});

const PREP_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { eventId: { type: 'string' }, label: { type: 'string' }, detail: { type: 'string' } },
        required: ['eventId', 'label', 'detail'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

/** Muse Spark turns tomorrow's household events into a short "get ready" list for a 10-year-old. If the
 * model is down or over budget, the card still goes out with the routine's fixed steps. */
export const prepBedtime = internalAction({
  args: { runId: v.id('routineRuns') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.routines.loadBedtimeContext, { runId: args.runId });
    if (!data) return null;
    let items: { eventId: string; label: string; detail: string }[] = [];
    try {
      const res = await callModel(ctx, data.familyId, {
        messages: [
          { role: 'system', content: `Make a short bedtime "get ready for tomorrow" checklist for ${data.kidName}, a kid. For each event below, list the 1 to 3 things to pack or get ready tonight (e.g. "Cleats", "Water bottle"). Each label under 30 characters, plain words, no emoji. "detail" is an optional few words (or empty). Use the event's id. At most ${ROUTINES.bedtimeMaxItems} items in all.` },
          { role: 'user', content: data.events.map((e) => `- [${e.id}] ${e.title}, ${e.when}${e.place ? `, at ${e.place}` : ''}`).join('\n') },
        ],
        schema: { name: 'bedtimePrep', schema: PREP_SCHEMA, strict: true },
        maxTokens: LIMITS.agent.maxTokensStructured,
        effort: LIMITS.agent.effort,
      });
      items = parseJson<{ items: typeof items }>(res.text)?.items ?? [];
    } catch (e) {
      console.log(`[routines] bedtime prep for ${args.runId} fell back to fixed steps (${e instanceof Error ? e.message : String(e)})`);
    }
    await ctx.runMutation(internal.routines.finishBedtime, { runId: args.runId, items });
    return null;
  },
});

export const finishBedtime = internalMutation({
  args: { runId: v.id('routineRuns'), items: v.array(v.object({ eventId: v.string(), label: v.string(), detail: v.string() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const allowed = new Set(args.items.map((i) => i.eventId));
    const derived = [];
    for (const [n, item] of args.items.entries()) {
      const eventId = ctx.db.normalizeId('events', item.eventId);
      // Only ids of tomorrow's household events the kid is in (never trust the model's ids).
      const event = eventId && allowed.has(item.eventId) ? await ctx.db.get(eventId) : null;
      if (!event || event.familyId !== run.familyId || layerOf(event) !== 'household' || !event.who.includes(run.memberId)) continue;
      const label = item.label.trim().slice(0, 40);
      if (!label) continue;
      derived.push({ id: `prep-${n}`, label, detail: item.detail.trim().slice(0, 60) || undefined, done: false, source: { eventId: event._id, title: event.title, start: event.start } });
      if (derived.length >= ROUTINES.bedtimeMaxItems) break;
    }
    // G4b: a paused holiday's note (HOLIDAYS.bedtimeNoteStepId) stays first, above the derived items.
    const note = run.steps.filter((s) => s.id === HOLIDAYS.bedtimeNoteStepId);
    await ctx.db.patch(run._id, { steps: [...note, ...derived, ...run.steps.filter((s) => !s.source && s.id !== HOLIDAYS.bedtimeNoteStepId)] });
    const now = await clock.now(ctx, run.familyId);
    await deliverRoutineCard(ctx, (await ctx.db.get(run._id))!, now);
    return null;
  },
});
