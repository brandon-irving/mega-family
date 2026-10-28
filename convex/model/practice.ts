// GD (CONTRACT v0.13): homework practice (invariant 5: hints, never answers). A question's `answerIndex`
// lives only in the database: `practiceViewOf` is the single shape every caller (kid AND parent) gets, and it
// never includes the correct choice. A drafted hint that contains the correct choice's text is rejected
// (`isGivingAway`), redrafted once, then the question is dropped.
import { HOMEWORK } from '../../shared/config/kids';
import { MEGA_BUCKS } from '../../shared/config/store';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';

type Ctx = QueryCtx | MutationCtx;
type Question = Doc<'practiceSets'>['questions'][number];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** True when a hint would give the answer away (it contains the correct choice's text). */
export function isGivingAway(q: Pick<Question, 'choices' | 'answerIndex' | 'hint'>): boolean {
  const answer = q.choices[q.answerIndex];
  return !!answer && norm(q.hint).includes(norm(answer));
}

/** A well-formed question: a prompt, exactly HOMEWORK.choicesPerQuestion distinct choices, an answer in
 * range, and a hint that doesn't give it away. */
export function isUsableQuestion(q: Partial<Question>): q is Question {
  if (typeof q.prompt !== 'string' || !q.prompt.trim()) return false;
  if (!Array.isArray(q.choices) || q.choices.length !== HOMEWORK.choicesPerQuestion || q.choices.some((c) => typeof c !== 'string' || !c.trim())) return false;
  if (new Set(q.choices.map(norm)).size !== q.choices.length) return false;
  if (!Number.isInteger(q.answerIndex) || q.answerIndex! < 0 || q.answerIndex! >= q.choices.length) return false;
  if (typeof q.hint !== 'string' || !q.hint.trim()) return false;
  return !isGivingAway(q as Question);
}

export async function attemptsOf(ctx: Ctx, set: Doc<'practiceSets'>): Promise<Doc<'practiceAttempts'>[]> {
  return ctx.db
    .query('practiceAttempts')
    .withIndex('by_family_set', (q) => q.eq('familyId', set.familyId).eq('setId', set._id))
    .collect();
}

type QState = { correct: boolean; tries: number; hinted: boolean; settled: boolean };

function stateOf(q: Question, attempts: Doc<'practiceAttempts'>[]): QState {
  const mine = attempts.filter((a) => a.questionId === q.id);
  const answers = mine.filter((a) => a.kind === 'answer');
  const correct = answers.some((a) => a.correct);
  return { correct, tries: answers.length, hinted: mine.some((a) => a.kind === 'hint' || (a.kind === 'answer' && !a.correct)), settled: correct || answers.length >= HOMEWORK.maxTriesPerQuestion };
}

/** Who may see a set: the kid it's for, or one of that kid's parents. */
export function requirePracticeViewer(viewer: { member: Doc<'members'>; isParentOf: Id<'members'>[] }, set: Doc<'practiceSets'>): void {
  if (set.familyId !== viewer.member.familyId) fail('NOT_FOUND');
  if (viewer.member._id !== set.forMemberId && !viewer.isParentOf.includes(set.forMemberId)) fail('FORBIDDEN');
}

/** The ONE shape a practice set leaves the server in. Never `answerIndex`, never which choice is right. */
export async function practiceViewOf(ctx: Ctx, set: Doc<'practiceSets'>, viewer: Doc<'members'>) {
  const attempts = await attemptsOf(ctx, set);
  const sheet = await ctx.db.get(set.sheetId);
  const release = (
    await ctx.db
      .query('bucksLedger')
      .withIndex('by_family_member_at', (q) => q.eq('familyId', set.familyId).eq('memberId', set.forMemberId))
      .collect()
  ).find((r) => r.source.kind === 'practice' && r.source.setId === set._id);
  return {
    setId: set._id,
    forMemberId: set.forMemberId,
    status: set.status,
    topic: sheet?.topic,
    questions: set.questions.map((q) => {
      const s = stateOf(q, attempts);
      return { id: q.id, prompt: q.prompt, choices: q.choices, hint: s.hinted ? q.hint : undefined, answered: s.tries ? { correct: s.correct, tries: s.tries } : null };
    }),
    summary: set.summary,
    released: release ? { amount: release.delta, byId: release.byId, at: release.at } : null,
    canRelease: (MEGA_BUCKS.releasers as readonly string[]).includes(viewer.role) && viewer._id !== set.forMemberId,
  };
}

/** The kid answers one question. Wrong → the hint (a guiding question). Returns whether the set is done. */
export async function answerQuestion(ctx: MutationCtx, params: { set: Doc<'practiceSets'>; kid: Doc<'members'>; questionId: string; choiceIndex: number; now: number }): Promise<{ correct: boolean; hint?: string; done: boolean }> {
  const { set, kid, now } = params;
  if (set.forMemberId !== kid._id) fail('FORBIDDEN', 'that practice is for someone else');
  if (set.status !== 'ready') fail('VALIDATION', set.status === 'done' ? 'you already finished this one' : 'that practice isn’t ready');
  const q = set.questions.find((x) => x.id === params.questionId);
  if (!q) fail('VALIDATION', 'no such question');
  if (!Number.isInteger(params.choiceIndex) || params.choiceIndex < 0 || params.choiceIndex >= q.choices.length) fail('VALIDATION', 'pick one of the choices');
  const attempts = await attemptsOf(ctx, set);
  if (stateOf(q, attempts).settled) fail('VALIDATION', 'you already answered that one');
  const correct = params.choiceIndex === q.answerIndex;
  await ctx.db.insert('practiceAttempts', { familyId: set.familyId, setId: set._id, questionId: q.id, memberId: kid._id, kind: 'answer', choiceIndex: params.choiceIndex, correct, at: now });
  if (!set.startedAt) await ctx.db.patch(set._id, { startedAt: now });
  const after = await attemptsOf(ctx, set);
  const done = set.questions.every((x) => stateOf(x, after).settled);
  if (done) await finishSet(ctx, (await ctx.db.get(set._id))!, after, now);
  return { correct, hint: correct ? undefined : q.hint, done };
}

export async function useHint(ctx: MutationCtx, params: { set: Doc<'practiceSets'>; kid: Doc<'members'>; questionId: string; now: number }): Promise<{ hint: string }> {
  const { set, kid } = params;
  if (set.forMemberId !== kid._id) fail('FORBIDDEN', 'that practice is for someone else');
  if (set.status !== 'ready') fail('VALIDATION', 'that practice isn’t open');
  const q = set.questions.find((x) => x.id === params.questionId);
  if (!q) fail('VALIDATION', 'no such question');
  await ctx.db.insert('practiceAttempts', { familyId: set.familyId, setId: set._id, questionId: q.id, memberId: kid._id, kind: 'hint', at: params.now });
  return { hint: q.hint };
}

/** Marks the set done with its numbers and a plain fallback note; `homework.summarize` then asks Muse Spark
 * for a better note and sends the parent's summary card. */
export async function finishSet(ctx: MutationCtx, set: Doc<'practiceSets'>, attempts: Doc<'practiceAttempts'>[], now: number): Promise<void> {
  const states = set.questions.map((q) => stateOf(q, attempts));
  const correct = states.filter((s) => s.correct).length;
  const hintsUsed = attempts.filter((a) => a.kind === 'hint').length;
  const minutes = Math.max(1, Math.round((now - (set.startedAt ?? now)) / 60_000));
  const note = correct === set.questions.length ? 'All correct.' : `${set.questions.length - correct} to look at again.`;
  await ctx.db.patch(set._id, { status: 'done', finishedAt: now, summary: { correct, total: set.questions.length, hintsUsed, minutes, note } });
  await ctx.scheduler.runAfter(0, internal.homework.summarize, { setId: set._id });
}
