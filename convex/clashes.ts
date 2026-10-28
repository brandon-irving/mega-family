// GD (CONTRACT v0.13): Hub's clash proposals — internal only (the app sees them through `proposals.*`).
// `detectClashes` (convex/model/clashes.ts) finds a clash between two HOUSEHOLD events; `propose` asks Muse
// Spark for one fix, has Muse Wonder word it (the only thing Wonder does), then `createProposal` writes a
// pending proposal and sends the Admin a proposal card from Hub. Nothing on the calendar changes until the
// Admin approves it (`proposals.decide`).
import { v } from 'convex/values';
import { CLASH } from '../shared/config/calendar';
import { LIMITS } from '../shared/config/limits';
import { formatLocalDateTime, localDateTimeToInstant } from '../shared/time';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { householdEventsInWindow, overlapMs } from './model/clashes';
import { callModel, decidedByModel, parseJson } from './model/modelCall';
import { insertProposal } from './model/proposals';
import { layerOf } from './model/visibility';
import { clock } from './ports/clock';

const MINUTE = 60_000;

const eventLine = v.object({ id: v.id('events'), title: v.string(), when: v.string(), who: v.array(v.string()) });

export const loadContext = internalQuery({
  args: { collisionId: v.id('collisions') },
  returns: v.union(
    v.null(),
    v.object({
      familyId: v.id('families'),
      tz: v.string(),
      member: v.object({ id: v.id('members'), name: v.string() }),
      clash: v.array(eventLine),
      sameDay: v.array(eventLine),
      adults: v.array(v.object({ id: v.id('members'), name: v.string() })),
    }),
  ),
  handler: async (ctx, args) => {
    const collision = await ctx.db.get(args.collisionId);
    if (!collision || collision.status !== 'open') return null;
    const family = await ctx.db.get(collision.familyId);
    const member = await ctx.db.get(collision.memberId);
    const events = (await Promise.all(collision.eventIds.map((id) => ctx.db.get(id)))).filter((e): e is Doc<'events'> => !!e);
    // Defense in depth: only household events ever reach the model (they're the only ones a collision holds).
    if (!family || !member || events.length !== 2 || events.some((e) => layerOf(e) !== 'household')) return null;
    const members = await ctx.db
      .query('members')
      .withIndex('by_family', (q) => q.eq('familyId', collision.familyId))
      .collect();
    const nameOf = (id: Id<'members'>) => members.find((m) => m._id === id)?.name ?? 'someone';
    const tz = family.timezone;
    const line = (e: Doc<'events'>) => ({ id: e._id, title: e.title, when: `${formatLocalDateTime(e.start, tz, { weekday: 'short' })}${e.end ? ` to ${formatLocalDateTime(e.end, tz, { weekday: 'short' })}` : ''}`, who: e.who.map(nameOf) });
    const dayStart = Math.min(...events.map((e) => e.start)) - 12 * 60 * MINUTE;
    const dayEnd = Math.max(...events.map((e) => e.end ?? e.start)) + 12 * 60 * MINUTE;
    const sameDay = (await householdEventsInWindow(ctx, collision.familyId, dayStart, dayEnd)).filter((e) => !collision.eventIds.includes(e._id));
    return {
      familyId: collision.familyId,
      tz,
      member: { id: member._id, name: member.name },
      clash: events.map(line),
      sameDay: sameDay.map(line),
      adults: members.filter((m) => m.role !== 'kid').map((m) => ({ id: m._id, name: m.name })),
    };
  },
});

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: [...CLASH.fixKinds] },
    eventId: { type: 'string' },
    toMemberId: { type: 'string' },
    newStart: { type: 'string' },
    newEnd: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['kind', 'eventId', 'toMemberId', 'newStart', 'newEnd', 'reason'],
  additionalProperties: false,
} as const;

const WORDING_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' }, text: { type: 'string' } },
  required: ['title', 'text'],
  additionalProperties: false,
} as const;

/** Finds one fix (Muse Spark), then words it (Muse Wonder), then writes the pending proposal. A model that
 * returns an invalid fix leaves the clash open with no proposal (logged) — never a half-checked change. */
export const propose = internalAction({
  args: { collisionId: v.id('collisions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.clashes.loadContext, { collisionId: args.collisionId });
    if (!data) return null;
    const fmt = (e: { id: string; title: string; when: string; who: string[] }) => `- [${e.id}] ${e.title}, ${e.when}, needs: ${e.who.join(', ') || 'nobody named'}`;
    const system = [
      "You are Hub, a family's shared AI assistant. Two events on the family's shared calendar clash: they overlap and both need the same person.",
      'Propose exactly ONE fix: either "reassign" one of the two events from that person to another adult who is free then, or "move" one of the two events to a time that no longer overlaps.',
      'Prefer reassigning a pickup/drop-off to a free adult over moving a fixed appointment. Use only the events and people listed; you know nothing else about anyone.',
      'For "reassign": set eventId, toMemberId (an adult id from the list); leave newStart and newEnd empty. For "move": set eventId, newStart and newEnd as local "YYYY-MM-DDTHH:MM"; leave toMemberId empty.',
    ].join('\n');
    const user = [
      `Family timezone: ${data.tz}. The person needed in both: ${data.member.name} (${data.member.id}).`,
      'The clash:',
      ...data.clash.map(fmt),
      'Other shared events around then:',
      ...(data.sameDay.length ? data.sameDay.map(fmt) : ['- none']),
      `Adults (name, id): ${data.adults.map((a) => `${a.name} (${a.id})`).join('; ')}`,
    ].join('\n');

    let fixJson: Record<string, string> | null = null;
    try {
      const res = await callModel(ctx, data.familyId, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        schema: { name: 'clashFix', schema: FIX_SCHEMA, strict: true },
        maxTokens: LIMITS.agent.maxTokensStructured,
        effort: LIMITS.agent.effort,
        model: 'chat',
      });
      fixJson = parseJson<Record<string, string>>(res.text);
    } catch (e) {
      console.log(`[clashes] ${args.collisionId}: fix model call failed (${e instanceof Error ? e.message : String(e)})`);
      return null;
    }
    if (!fixJson) return null;

    const checked = await ctx.runQuery(internal.clashes.checkFix, {
      collisionId: args.collisionId,
      kind: fixJson.kind ?? '',
      eventId: fixJson.eventId ?? '',
      toMemberId: fixJson.toMemberId ?? '',
      newStart: fixJson.newStart ? safeInstant(fixJson.newStart, data.tz) : 0,
      newEnd: fixJson.newEnd ? safeInstant(fixJson.newEnd, data.tz) : 0,
    });
    if (!checked.ok) {
      console.log(`[clashes] ${args.collisionId}: model proposed an invalid fix (${checked.why}); no proposal written`);
      return null;
    }

    let wording: { title: string; text: string } | null = null;
    try {
      const res = await callModel(ctx, data.familyId, {
        messages: [
          { role: 'system', content: 'Word ONE proposed calendar fix for a family. Return a short headline (under 50 characters, no emoji) and one plain sentence (under 140 characters) saying why. Calm and clear; name people by the names given. Do not add anything that is not in the facts.' },
          { role: 'user', content: `Fix: ${checked.summary}\nWhy: ${fixJson.reason ?? ''}` },
        ],
        schema: { name: 'clashWording', schema: WORDING_SCHEMA, strict: true },
        maxTokens: LIMITS.agent.maxTokensStructured,
        effort: 'low',
        model: 'wording',
      });
      wording = parseJson<{ title: string; text: string }>(res.text);
    } catch (e) {
      console.log(`[clashes] ${args.collisionId}: wording call failed (${e instanceof Error ? e.message : String(e)})`);
      return null;
    }
    if (!wording?.title?.trim() || !wording.text?.trim()) return null;

    await ctx.runMutation(internal.clashes.createProposal, {
      collisionId: args.collisionId,
      fix: checked.fix,
      title: wording.title.trim().slice(0, 80),
      text: wording.text.trim().slice(0, 240),
      wordedBy: decidedByModel('wording'),
      reasonedBy: decidedByModel('chat'),
    });
    return null;
  },
});

function safeInstant(s: string, tz: string): number {
  try {
    return localDateTimeToInstant(s, tz);
  } catch {
    return 0;
  }
}

const fixValidator = v.union(
  v.object({ kind: v.literal('reassign'), eventId: v.id('events'), from: v.id('members'), to: v.id('members') }),
  v.object({ kind: v.literal('move'), eventId: v.id('events'), start: v.number(), end: v.optional(v.number()) }),
);

/** Validates a model-proposed fix against the data (never trusts the model's ids or times). */
export const checkFix = internalQuery({
  args: { collisionId: v.id('collisions'), kind: v.string(), eventId: v.string(), toMemberId: v.string(), newStart: v.number(), newEnd: v.number() },
  returns: v.union(v.object({ ok: v.literal(true), fix: fixValidator, summary: v.string() }), v.object({ ok: v.literal(false), why: v.string() })),
  handler: async (ctx, args) => {
    const collision = await ctx.db.get(args.collisionId);
    if (!collision) return { ok: false as const, why: 'collision gone' };
    const eventId = collision.eventIds.find((id) => id === args.eventId);
    if (!eventId) return { ok: false as const, why: 'eventId is not one of the two clashing events' };
    const event = (await ctx.db.get(eventId))!;
    const other = (await ctx.db.get(collision.eventIds.find((id) => id !== eventId)!))!;
    const family = (await ctx.db.get(collision.familyId))!;
    const tz = family.timezone;
    if (args.kind === 'reassign') {
      const toId = ctx.db.normalizeId('members', args.toMemberId);
      const to = toId ? await ctx.db.get(toId) : null;
      if (!to || to.familyId !== collision.familyId || to.role === 'kid') return { ok: false as const, why: 'toMemberId is not an adult in this family' };
      if (to._id === collision.memberId) return { ok: false as const, why: 'reassigned to the same person' };
      if (!event.who.includes(collision.memberId)) return { ok: false as const, why: 'that event does not need the clashing person' };
      // "Free" is judged on the household layer only — the checker never reads anyone's private events.
      const around = await householdEventsInWindow(ctx, collision.familyId, event.start - 12 * 60 * MINUTE, event.end ?? event.start);
      const busy = around.some((e) => e._id !== event._id && e.who.includes(to._id) && overlapMs(e, event) > 0);
      if (busy) return { ok: false as const, why: 'that adult has a shared event then' };
      const from = (await ctx.db.get(collision.memberId))!;
      return { ok: true as const, fix: { kind: 'reassign' as const, eventId, from: collision.memberId, to: to._id }, summary: `${to.name} takes "${event.title}" (${formatLocalDateTime(event.start, tz, { weekday: 'short' })}) instead of ${from.name}.` };
    }
    if (args.kind === 'move') {
      if (!(args.newStart > 0) || (args.newEnd && args.newEnd <= args.newStart)) return { ok: false as const, why: 'bad new time' };
      const end = args.newEnd || undefined;
      if (overlapMs({ start: args.newStart, end: end ?? args.newStart }, other) > 0) return { ok: false as const, why: 'the new time still overlaps' };
      return { ok: true as const, fix: { kind: 'move' as const, eventId, start: args.newStart, end }, summary: `Move "${event.title}" to ${formatLocalDateTime(args.newStart, tz, { weekday: 'short' })}.` };
    }
    return { ok: false as const, why: `unknown fix kind "${args.kind}"` };
  },
});

/** Live finding (Oct 28): Muse Wonder sometimes repeats the headline on its own line at the start of the
 * sentence. The card shows the title already, so drop a leading copy of it and fold the rest onto one line. */
function cleanProposalText(title: string, text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines[0].toLowerCase() === title.trim().toLowerCase()) lines.shift();
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

/** Writes the pending proposal (before/after snapshots, the family's membership as its audience) and sends
 * the Admin a proposal card from Hub. One proposal per collision. */
export const createProposal = internalMutation({
  args: { collisionId: v.id('collisions'), fix: fixValidator, title: v.string(), text: v.string(), wordedBy: v.string(), reasonedBy: v.string() },
  returns: v.union(v.id('proposals'), v.null()),
  handler: async (ctx, args) => {
    const collision = await ctx.db.get(args.collisionId);
    if (!collision || collision.status !== 'open') return null;
    const existing = await ctx.db
      .query('proposals')
      .withIndex('by_family_collision', (q) => q.eq('familyId', collision.familyId).eq('collisionId', collision._id))
      .first();
    if (existing) return null;
    const now = await clock.now(ctx, collision.familyId);
    return insertProposal(ctx, { collision, fix: args.fix, title: args.title, text: cleanProposalText(args.title, args.text), wordedBy: args.wordedBy as `model:${string}`, reasonedBy: args.reasonedBy as `model:${string}`, now });
  },
});
