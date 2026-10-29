// G5: the nightly profiler (PLAN.md → Learning; docs/gates/G5.md invariant 12). Once a night per member (at
// PROFILER.runAt, family time) it reads the member's own recent, non-sensitive memories — their personal scope
// plus household memories about them, never anyone else's private ones — and asks one structured Muse Spark call
// what that says about THIS member's profile (basics like grade or team, routines like "soccer Mon/Wed 4:30").
// Rules only tighten: it can fill the member's own `profiles.basics` / `routines`, nothing else (no controls, no
// other member, no sharing). Confidence decides: ≥ applyMinConfidence → applied; ≥ askMinConfidence → one check
// question later (a quiet choice block in the member's thread inside PROFILER.askWindow, at most
// maxCheckQuestionsPerMemberPerDay); below → dropped. The answer confirms or retires the memory, no agent turn.
import { LIMITS } from '../../shared/config';
import { fillCopy, G5_COPY } from '../../shared/config/copy';
import { PROFILER } from '../../shared/config/onboarding';
import type { BlockAnswer } from '../../shared/domain/messages';
import { addDays, localDate, parseClockTime, zonedInstant } from '../../shared/time';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { scopeKey } from './scopes';
import { postOwnMegaMessage } from './threads';

export type ProfilerUpdate = { memoryIndex: number; kind: 'basic' | 'routine'; key: string; value: string; days: number[]; time: string; confidence: number; question: string };

export const PROFILER_SCHEMA = {
  name: 'profile_updates',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['updates'],
    properties: {
      updates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['memoryIndex', 'kind', 'key', 'value', 'days', 'time', 'confidence', 'question'],
          properties: {
            memoryIndex: { type: 'integer', description: 'Which numbered memory this comes from' },
            kind: { type: 'string', enum: ['basic', 'routine'] },
            key: { type: 'string', description: 'basic: a short lowercase label like "grade" or "team"; routine: ""' },
            value: { type: 'string', description: 'basic: the value; routine: what happens, like "Soccer practice"' },
            days: { type: 'array', items: { type: 'integer' }, description: 'routine: weekdays 0=Sunday…6=Saturday; else []' },
            time: { type: 'string', description: 'routine: HH:MM 24-hour or ""' },
            confidence: { type: 'number', description: '0 to 1: how sure the memory supports this' },
            question: { type: 'string', description: 'A short yes/no question to check it, like "Is soccer still Mondays and Wednesdays?"' },
          },
        },
      },
    },
  },
} as const;

/** The memories the profiler may read for a member: their own personal scope and household memories about
 * them, created since `since`, not sensitive, still valid. Never another member's personal memories. */
export async function memoriesForProfiler(ctx: QueryCtx, familyId: Id<'families'>, memberId: Id<'members'>, since: number, now: number): Promise<Doc<'memories'>[]> {
  const take = PROFILER.maxMemoriesPerRun * 2;
  const personal = await ctx.db
    .query('memories')
    .withIndex('by_family_scopeKey', (q) => q.eq('familyId', familyId).eq('scopeKey', scopeKey(familyId, { scope: 'personal', memberId })))
    .order('desc')
    .take(take);
  const household = await ctx.db
    .query('memories')
    .withIndex('by_family_scopeKey', (q) => q.eq('familyId', familyId).eq('scopeKey', scopeKey(familyId, { scope: 'family' })))
    .order('desc')
    .take(take);
  const usable = (m: Doc<'memories'>) => !m.sensitive && m.createdAt >= since && (m.validUntil === undefined || m.validUntil > now);
  return [...personal.filter(usable), ...household.filter((m) => usable(m) && m.about.includes(memberId))].sort((a, b) => a.createdAt - b.createdAt).slice(-PROFILER.maxMemoriesPerRun);
}

export function buildProfilerPrompt(memberName: string, memories: { text: string }[]): { system: string; user: string } {
  const system = [
    `You update one family member's profile (${memberName}) from what their family assistant learned today.`,
    'Only propose facts about THIS person: basics (grade, school, team, job, favorite things) and weekly routines.',
    'Never propose anything about other people, health, money, or private matters. Skip anything unclear.',
    'Give each update a confidence from 0 to 1 and a short yes/no question that would check it.',
  ].join(' ');
  const user = memories.map((m, i) => `${i}. ${m.text.slice(0, 300)}`).join('\n');
  return { system, user };
}

const KEY_RE = /^[a-z][a-z ]{0,29}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Schema-valid, in-range updates only (the model never names a memory id; it points at one by index). */
export function validateUpdates(raw: unknown, memoryCount: number): ProfilerUpdate[] {
  const list = (raw as { updates?: unknown } | null)?.updates;
  if (!Array.isArray(list)) return [];
  const out: ProfilerUpdate[] = [];
  for (const u of list.slice(0, 20)) {
    const r = u as Record<string, unknown>;
    const idx = r.memoryIndex;
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= memoryCount) continue;
    if (r.kind !== 'basic' && r.kind !== 'routine') continue;
    const value = typeof r.value === 'string' ? r.value.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 80) : '';
    const confidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? Math.max(0, Math.min(1, r.confidence)) : 0;
    const question = typeof r.question === 'string' ? r.question.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 140) : '';
    const key = typeof r.key === 'string' ? r.key.trim().toLowerCase() : '';
    const days = Array.isArray(r.days) ? [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort() : [];
    const time = typeof r.time === 'string' && TIME_RE.test(r.time) ? r.time : '';
    if (!value) continue;
    if (r.kind === 'basic' && !KEY_RE.test(key)) continue;
    if (r.kind === 'routine' && !days.length) continue;
    out.push({ memoryIndex: idx, kind: r.kind, key, value, days, time, confidence, question });
  }
  return out;
}

/** Applies / queues / drops the validated updates on the member's OWN profile; records the run (once per day). */
export async function applyProfilerRun(
  ctx: MutationCtx,
  p: { familyId: Id<'families'>; memberId: Id<'members'>; day: string; memoryIds: Id<'memories'>[]; updates: ProfilerUpdate[]; decidedBy: Doc<'profilerRuns'>['decidedBy']; failure?: Doc<'profilerRuns'>['failure']; now: number; tz: string },
): Promise<void> {
  const existing = await ctx.db
    .query('profilerRuns')
    .withIndex('by_family_member_day', (q) => q.eq('familyId', p.familyId).eq('memberId', p.memberId).eq('day', p.day))
    .first();
  if (existing) return;
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_family_member', (q) => q.eq('familyId', p.familyId).eq('memberId', p.memberId))
    .unique();
  let applied = 0;
  let asked = 0;
  let dropped = 0;
  if (profile) {
    const basics = { ...profile.basics };
    const routines = [...profile.routines];
    const checkQuestions = [...profile.checkQuestions];
    const askStart = parseClockTime(PROFILER.askWindow.start) ?? 16 * 60;
    for (const u of p.updates) {
      const memoryId = p.memoryIds[u.memoryIndex];
      if (!memoryId) continue;
      if (u.confidence >= PROFILER.applyMinConfidence) {
        if (u.kind === 'basic') basics[u.key] = u.value;
        else if (!routines.some((r) => r.text.toLowerCase() === u.value.toLowerCase())) routines.push({ text: u.value, days: u.days, ...(u.time ? { time: u.time } : {}), confirmed: true });
        applied++;
      } else if (u.confidence >= PROFILER.askMinConfidence && !checkQuestions.some((q) => q.memoryId === memoryId)) {
        const memory = await ctx.db.get(memoryId);
        const question = u.question || `Is this still right: ${memory?.text.slice(0, 100) ?? u.value}?`;
        checkQuestions.push({ memoryId, question, askAfter: zonedInstant(localDate(p.now, p.tz), askStart, p.tz) });
        asked++;
      } else dropped++;
    }
    await ctx.db.patch(profile._id, { basics, routines: routines.slice(-30), checkQuestions: checkQuestions.slice(-20) });
  }
  await ctx.db.insert('profilerRuns', { familyId: p.familyId, memberId: p.memberId, day: p.day, memoriesRead: p.memoryIds.length, applied, asked, dropped, decidedBy: p.decidedBy, ranAt: p.now, ...(p.failure ? { failure: p.failure } : {}) });
}

/** Inside the ask window: posts at most maxCheckQuestionsPerMemberPerDay due check questions as quiet choice
 * blocks in the member's own thread (no push). */
export async function askDueCheckQuestions(ctx: MutationCtx, family: Doc<'families'>, member: Doc<'members'>, now: number): Promise<void> {
  const tz = family.timezone;
  const today = localDate(now, tz);
  const start = parseClockTime(PROFILER.askWindow.start);
  const end = parseClockTime(PROFILER.askWindow.end);
  if (start === null || end === null || now < zonedInstant(today, start, tz) || now >= zonedInstant(today, end, tz)) return;
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_family_member', (q) => q.eq('familyId', family._id).eq('memberId', member._id))
    .unique();
  if (!profile || !profile.checkQuestions.length) return;
  const dayStart = zonedInstant(today, 0, tz);
  const dayEnd = zonedInstant(addDays(today, 1), 0, tz);
  let askedToday = 0;
  for (const q of profile.checkQuestions) {
    if (!q.messageId) continue;
    const m = await ctx.db.get(q.messageId);
    if (m && m.at >= dayStart && m.at < dayEnd) askedToday++;
  }
  const questions = [...profile.checkQuestions];
  for (const [i, q] of questions.entries()) {
    if (askedToday >= PROFILER.maxCheckQuestionsPerMemberPerDay) break;
    if (q.messageId || q.askAfter > now) continue;
    const messageId = await postOwnMegaMessage(
      ctx,
      family._id,
      member._id,
      {
        type: 'block',
        block: {
          kind: 'choice',
          prompt: q.question,
          multi: false,
          allowOther: false,
          options: [
            { id: 'yes', label: G5_COPY.checkYes },
            { id: 'no', label: G5_COPY.checkNo },
            { id: 'skip', label: G5_COPY.checkSkip },
          ],
        },
      },
      now,
    );
    if (!messageId) break;
    questions[i] = { ...q, messageId };
    askedToday++;
  }
  await ctx.db.patch(profile._id, { checkQuestions: questions });
}

/** `chat.answerBlock` on a check question: Yes confirms the memory, Not anymore retires it, Skip just drops the
 * question. Only the member's own question in their own thread. Returns false when `message` isn't one. */
export async function answerCheckQuestion(ctx: MutationCtx, member: Doc<'members'>, message: Doc<'messages'>, answer: BlockAnswer, now: number): Promise<boolean> {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_family_member', (q) => q.eq('familyId', member.familyId).eq('memberId', member._id))
    .unique();
  const question = profile?.checkQuestions.find((q) => q.messageId === message._id);
  if (!profile || !question) return false;
  const picked = answer.optionIds?.[0];
  const memory = await ctx.db.get(question.memoryId);
  if (memory && memory.familyId === member.familyId) {
    if (picked === 'yes') await ctx.db.patch(memory._id, { confirmed: true, lastUsedAt: now });
    else if (picked === 'no') await ctx.db.patch(memory._id, { confirmed: false, validUntil: now });
  }
  await ctx.db.patch(profile._id, { checkQuestions: profile.checkQuestions.filter((q) => q.messageId !== message._id) });
  await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'text', text: fillCopy(G5_COPY.checkAck, {}) }, now);
  return true;
}

export const PROFILER_MAX_TOKENS = LIMITS.agent.maxTokensStructured;
