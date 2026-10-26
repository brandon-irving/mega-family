// Executes one tool call (PLAN.md → Chat tools; task brief: "Tool handlers get the viewer from the server,
// never from model output; every tool validates args against shared/domain schemas and enforces the same
// permissions as the public API"). One internalMutation, called by the agent loop (an action) through
// `ctx.runMutation` — a tool call can never reach this from the client, and the model never supplies
// `familyId`/`memberId`/`role` (CONTRACT rule 3's analog for internal plumbing): the loop passes the ids it
// already validated when the turn started.
import { v } from 'convex/values';
import { MEMORY_KINDS, SCOPES } from '../../shared/domain/enums';
import type { UIBlock } from '../../shared/domain/messages';
import type { Doc, Id } from '../_generated/dataModel';
import { internalMutation } from '../_generated/server';
import { applyLearningDecision } from '../model/applyLearning';
import { decideLearning, type LearningOp } from '../model/learningPolicy';
import { canSeeScoped } from '../model/visibility';
import { getOrCreateOwnThread } from '../model/threads';
import { recall } from '../model/recall';
import { clock } from '../ports/clock';
import { isToolAllowedForRole } from './toolSpecs';

type Caller = { familyId: Id<'families'>; memberId: Id<'members'>; role: Doc<'members'>['role']; megaId: Id<'megas'> | null; threadId: Id<'threads'> };

// ---------- small arg validators (shared/domain enums back every enum check) ----------

function str(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`"${field}" must be a non-empty string`);
  return v;
}
function optStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function num(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`"${field}" must be a finite number`);
  return v;
}
function optNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function bool(v: unknown, field: string, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw new Error(`"${field}" must be one of: ${allowed.join(', ')}`);
  return v as T;
}

async function loadMember(ctx: any, familyId: Id<'families'>, raw: unknown, field: string): Promise<Doc<'members'>> {
  const idStr = str(raw, field);
  let doc: Doc<'members'> | null = null;
  try {
    doc = await ctx.db.get(idStr as Id<'members'>);
  } catch {
    doc = null;
  }
  if (!doc || doc.familyId !== familyId) throw new Error(`"${field}" is not a member of this family`);
  return doc;
}

async function loadEvent(ctx: any, familyId: Id<'families'>, raw: unknown): Promise<Doc<'events'>> {
  const idStr = str(raw, 'eventId');
  let doc: Doc<'events'> | null = null;
  try {
    doc = await ctx.db.get(idStr as Id<'events'>);
  } catch {
    doc = null;
  }
  if (!doc || doc.familyId !== familyId) throw new Error('eventId not found');
  return doc;
}

/** Finds a visible list by name (case-insensitive), or creates a `family`-scope one. Mirrors how the model
 * actually knows about lists: by name (PLAN.md smoke test's own tool-call example, "Add milk to the
 * groceries list"), never by id. */
async function findOrCreateList(ctx: any, caller: Caller, listName: string): Promise<Doc<'lists'>> {
  const all = await ctx.db
    .query('lists')
    .withIndex('by_family', (q: any) => q.eq('familyId', caller.familyId))
    .collect();
  const visible = all.filter((l: Doc<'lists'>) => canSeeScoped(l.scope, { memberId: caller.memberId, role: caller.role }, { ownerId: l.ownerId }));
  const match = visible.find((l: Doc<'lists'>) => l.name.toLowerCase() === listName.toLowerCase());
  if (match) return match;
  const listId = await ctx.db.insert('lists', { familyId: caller.familyId, name: listName, scope: 'family' });
  return (await ctx.db.get(listId))!;
}

// ---------- per-tool handlers ----------

async function toolRecall(ctx: any, caller: Caller, raw: Record<string, unknown>): Promise<string> {
  const query = str(raw.query, 'query');
  const hits = await recall(ctx, caller.familyId, caller.memberId, caller.role, query, 5);
  if (!hits.length) return 'No matching memories found.';
  return hits.map((h) => `- (${h.kind}) ${h.text}`).join('\n');
}

async function toolRemember(ctx: any, caller: Caller, raw: Record<string, unknown>, now: number): Promise<string> {
  const text = str(raw.text, 'text');
  const kind = oneOf(raw.kind, MEMORY_KINDS, 'kind');
  const scope = oneOf(raw.scope, SCOPES, 'scope');
  const sensitive = bool(raw.sensitive, 'sensitive', false);
  if (scope === 'adults' && caller.role === 'kid') throw new Error("kids can't save adults-scope memories");
  if (scope === 'shared' && caller.role === 'kid') throw new Error("kids can't share memories with other members yet");

  const aboutRaw = strArray(raw.about);
  const about: Id<'members'>[] = [];
  for (const a of aboutRaw) about.push((await loadMember(ctx, caller.familyId, a, 'about'))._id);

  const shareWithRaw = strArray(raw.shareWithMemberIds);
  const shareWithMemberIds: Id<'members'>[] = [];
  for (const s of shareWithRaw) shareWithMemberIds.push((await loadMember(ctx, caller.familyId, s, 'shareWithMemberIds'))._id);

  let supersedes: Id<'memories'> | undefined;
  const supersedesRaw = optStr(raw.supersedesMemoryId);
  if (supersedesRaw) {
    let prior: Doc<'memories'> | null = null;
    try {
      prior = await ctx.db.get(supersedesRaw as Id<'memories'>);
    } catch {
      prior = null;
    }
    if (!prior || prior.familyId !== caller.familyId) throw new Error('supersedesMemoryId not found');
    supersedes = prior._id;
  }

  const op: LearningOp = {
    trigger: supersedes ? 'correction' : 'explicit',
    kind,
    text,
    suggestedScope: scope,
    shareWithMemberIds: shareWithMemberIds.length ? shareWithMemberIds : undefined,
    confidence: 1,
    sensitive,
    about: about.length ? about : [caller.memberId],
  };
  const decision = decideLearning(op, caller.memberId);
  const result = await applyLearningDecision(ctx, { familyId: caller.familyId, memberId: caller.memberId, role: caller.role, megaId: caller.megaId, threadId: caller.threadId, now }, op, decision, supersedes);
  return result.summary;
}

async function toolEventsCreate(ctx: any, caller: Caller, raw: Record<string, unknown>): Promise<string> {
  if (caller.role === 'kid') throw new Error("kids can't create events");
  const title = str(raw.title, 'title');
  const start = num(raw.start, 'start');
  const whoRaw = strArray(raw.who);
  const who: Id<'members'>[] = [];
  for (const w of whoRaw) who.push((await loadMember(ctx, caller.familyId, w, 'who'))._id);
  const scope = oneOf(raw.scope, SCOPES, 'scope');
  await ctx.db.insert('events', {
    familyId: caller.familyId,
    title,
    start,
    end: optNum(raw.end),
    allDay: optStr(raw.allDay),
    who,
    place: optStr(raw.place),
    source: 'mega',
    createdBy: caller.memberId,
    scope,
    cancelled: false,
  });
  return `created event "${title}"`;
}

async function toolEventsUpdate(ctx: any, caller: Caller, raw: Record<string, unknown>): Promise<string> {
  if (caller.role === 'kid') throw new Error("kids can't change events");
  const event = await loadEvent(ctx, caller.familyId, raw.eventId);
  const patch: Record<string, unknown> = {};
  if (typeof raw.title === 'string') patch.title = raw.title;
  if (typeof raw.start === 'number') patch.start = raw.start;
  if (typeof raw.end === 'number') patch.end = raw.end;
  if (typeof raw.place === 'string') patch.place = raw.place;
  if (Array.isArray(raw.who)) {
    const who: Id<'members'>[] = [];
    for (const w of strArray(raw.who)) who.push((await loadMember(ctx, caller.familyId, w, 'who'))._id);
    patch.who = who;
  }
  await ctx.db.patch(event._id, patch);
  return `updated event "${event.title}"`;
}

async function toolEventsCancel(ctx: any, caller: Caller, raw: Record<string, unknown>): Promise<string> {
  if (caller.role === 'kid') throw new Error("kids can't cancel events");
  const event = await loadEvent(ctx, caller.familyId, raw.eventId);
  await ctx.db.patch(event._id, { cancelled: true });
  return `cancelled event "${event.title}"`;
}

async function toolRemindersCreate(ctx: any, caller: Caller, raw: Record<string, unknown>): Promise<string> {
  const forMember = await loadMember(ctx, caller.familyId, raw.forMemberId, 'forMemberId');
  const text = str(raw.text, 'text');
  const dueAt = num(raw.dueAt, 'dueAt');
  let eventId: Id<'events'> | undefined;
  const eventRaw = optStr(raw.eventId);
  if (eventRaw) eventId = (await loadEvent(ctx, caller.familyId, eventRaw))._id;
  await ctx.db.insert('reminders', { familyId: caller.familyId, forMemberId: forMember._id, text, dueAt, eventId, done: false, createdBy: caller.memberId });
  return `set a reminder for ${forMember.name}: "${text}"`;
}

async function toolListsAdd(ctx: any, caller: Caller, raw: Record<string, unknown>, now: number): Promise<string> {
  const listName = str(raw.listName, 'listName');
  const text = str(raw.text, 'text');
  const list = await findOrCreateList(ctx, caller, listName);
  await ctx.db.insert('listItems', { familyId: caller.familyId, listId: list._id, text, checked: false, addedBy: caller.memberId, at: now });
  return `added "${text}" to ${list.name}`;
}

async function toolListsCheck(ctx: any, caller: Caller, raw: Record<string, unknown>): Promise<string> {
  const listName = str(raw.listName, 'listName');
  const itemText = str(raw.itemText, 'itemText');
  const checked = bool(raw.checked, 'checked', true);
  const list = await findOrCreateList(ctx, caller, listName);
  const items = await ctx.db
    .query('listItems')
    .withIndex('by_family_list', (q: any) => q.eq('familyId', caller.familyId).eq('listId', list._id))
    .collect();
  const item = items.find((i: Doc<'listItems'>) => i.text.toLowerCase() === itemText.toLowerCase());
  if (!item) return `couldn't find "${itemText}" on ${list.name}`;
  await ctx.db.patch(item._id, { checked });
  return `${checked ? 'checked off' : 'unchecked'} "${itemText}" on ${list.name}`;
}

async function toolListsRemove(ctx: any, caller: Caller, raw: Record<string, unknown>): Promise<string> {
  const listName = str(raw.listName, 'listName');
  const itemText = str(raw.itemText, 'itemText');
  const list = await findOrCreateList(ctx, caller, listName);
  const items = await ctx.db
    .query('listItems')
    .withIndex('by_family_list', (q: any) => q.eq('familyId', caller.familyId).eq('listId', list._id))
    .collect();
  const item = items.find((i: Doc<'listItems'>) => i.text.toLowerCase() === itemText.toLowerCase());
  if (!item) return `couldn't find "${itemText}" on ${list.name}`;
  await ctx.db.delete(item._id);
  return `removed "${itemText}" from ${list.name}`;
}

async function toolAskMember(ctx: any, caller: Caller, raw: Record<string, unknown>, now: number): Promise<string> {
  if (caller.role === 'kid') throw new Error("kids can't ask another member's MEGA");
  const target = await loadMember(ctx, caller.familyId, raw.toMemberId, 'toMemberId');
  if (target._id === caller.memberId) throw new Error("can't ask yourself");
  const text = str(raw.text, 'text');
  const requestId = await ctx.db.insert('requests', { familyId: caller.familyId, fromMemberId: caller.memberId, toMemberId: target._id, text, status: 'open' });

  const targetMega = await ctx.db
    .query('megas')
    .withIndex('by_family_owner', (q: any) => q.eq('familyId', caller.familyId).eq('ownerId', target._id))
    .unique();
  const targetThread = await getOrCreateOwnThread(ctx, caller.familyId, target._id, targetMega?._id ?? null, now);
  await ctx.db.insert('messages', {
    familyId: caller.familyId,
    threadId: targetThread._id,
    at: now,
    author: caller.megaId ? { kind: 'mega', id: caller.megaId } : { kind: 'system' },
    via: 'text',
    body: { type: 'card', card: { kind: 'request', requestId } },
    chips: [],
  });
  return `asked ${target.name}`;
}

const MAX_BLOCK_OPTIONS = 20; // generous upper bound; role-specific caps (adult/kid) are enforced by the app

function validateUiBlock(raw: unknown): UIBlock {
  if (!raw || typeof raw !== 'object') throw new Error('"block" must be an object');
  const b = raw as Record<string, unknown>;
  const kind = str(b.kind, 'block.kind');
  switch (kind) {
    case 'choice': {
      const options = Array.isArray(b.options) ? b.options : [];
      if (!options.length || options.length > MAX_BLOCK_OPTIONS) throw new Error('"block.options" must be 1..20 items');
      return {
        kind: 'choice',
        prompt: str(b.prompt, 'block.prompt'),
        options: options.map((o, i) => ({ id: typeof (o as any)?.id === 'string' ? (o as any).id : String(i), label: str((o as any)?.label, 'block.options[].label') })),
        multi: bool(b.multi, 'block.multi', false),
        allowOther: bool(b.allowOther, 'block.allowOther', false),
      };
    }
    case 'toggle':
      return { kind: 'toggle', prompt: str(b.prompt, 'block.prompt'), label: str(b.label, 'block.label'), value: bool(b.value, 'block.value', false) };
    case 'text':
      return { kind: 'text', prompt: str(b.prompt, 'block.prompt'), placeholder: optStr(b.placeholder) };
    case 'number':
      return { kind: 'number', prompt: str(b.prompt, 'block.prompt'), min: optNum(b.min), max: optNum(b.max) };
    case 'confirm': {
      const summary = Array.isArray(b.summary) ? b.summary : [];
      return {
        kind: 'confirm',
        prompt: str(b.prompt, 'block.prompt'),
        summary: summary.map((s) => ({ label: str((s as any)?.label, 'block.summary[].label'), value: str((s as any)?.value, 'block.summary[].value') })),
      };
    }
    default:
      throw new Error(`"block.kind" "${kind}" isn't offered as a chat tool block in G2 (choice/toggle/text/number/confirm only)`);
  }
}

async function toolShowUi(ctx: any, caller: Caller, raw: Record<string, unknown>, now: number): Promise<string> {
  const block = validateUiBlock(raw.block);
  await ctx.db.insert('messages', {
    familyId: caller.familyId,
    threadId: caller.threadId,
    at: now,
    author: caller.megaId ? { kind: 'mega', id: caller.megaId } : { kind: 'system' },
    via: 'text',
    body: { type: 'block', block },
    chips: [],
  });
  return 'shown';
}

async function toolFollowUp(ctx: any, caller: Caller, raw: Record<string, unknown>, now: number): Promise<string> {
  const text = str(raw.text, 'text');
  const afterMinutes = num(raw.afterMinutes, 'afterMinutes');
  if (afterMinutes <= 0 || afterMinutes > 60 * 24 * 14) throw new Error('"afterMinutes" must be between 1 and 20160 (2 weeks)');
  await ctx.db.insert('reminders', { familyId: caller.familyId, forMemberId: caller.memberId, text, dueAt: now + afterMinutes * 60_000, done: false, createdBy: caller.memberId });
  return `will check back in ${afterMinutes} minutes`;
}

// ---------- dispatcher ----------

export const execute = internalMutation({
  args: {
    familyId: v.id('families'),
    memberId: v.id('members'),
    megaId: v.optional(v.id('megas')),
    threadId: v.id('threads'),
    name: v.string(),
    argumentsJson: v.string(),
  },
  returns: v.object({ ok: v.boolean(), resultText: v.string() }),
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member || member.familyId !== args.familyId) return { ok: false, resultText: 'caller is not a member of this family' };
    if (!isToolAllowedForRole(args.name, member.role)) return { ok: false, resultText: `the "${args.name}" tool isn't available to you` };

    let raw: Record<string, unknown>;
    try {
      const parsed = JSON.parse(args.argumentsJson);
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      raw = parsed as Record<string, unknown>;
    } catch {
      return { ok: false, resultText: 'invalid tool arguments (not valid JSON)' };
    }

    const caller: Caller = { familyId: args.familyId, memberId: args.memberId, role: member.role, megaId: args.megaId ?? null, threadId: args.threadId };
    const now = await clock.now(ctx, args.familyId);

    try {
      switch (args.name) {
        case 'recall':
          return { ok: true, resultText: await toolRecall(ctx, caller, raw) };
        case 'remember':
          return { ok: true, resultText: await toolRemember(ctx, caller, raw, now) };
        case 'events_create':
          return { ok: true, resultText: await toolEventsCreate(ctx, caller, raw) };
        case 'events_update':
          return { ok: true, resultText: await toolEventsUpdate(ctx, caller, raw) };
        case 'events_cancel':
          return { ok: true, resultText: await toolEventsCancel(ctx, caller, raw) };
        case 'reminders_create':
          return { ok: true, resultText: await toolRemindersCreate(ctx, caller, raw) };
        case 'lists_add':
          return { ok: true, resultText: await toolListsAdd(ctx, caller, raw, now) };
        case 'lists_check':
          return { ok: true, resultText: await toolListsCheck(ctx, caller, raw) };
        case 'lists_remove':
          return { ok: true, resultText: await toolListsRemove(ctx, caller, raw) };
        case 'ask_member':
          return { ok: true, resultText: await toolAskMember(ctx, caller, raw, now) };
        case 'show_ui':
          return { ok: true, resultText: await toolShowUi(ctx, caller, raw, now) };
        case 'follow_up':
          return { ok: true, resultText: await toolFollowUp(ctx, caller, raw, now) };
        default:
          return { ok: false, resultText: `unknown tool "${args.name}"` };
      }
    } catch (e) {
      return { ok: false, resultText: e instanceof Error ? e.message : String(e) };
    }
  },
});
