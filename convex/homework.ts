// CONTRACT §4 `homework.*` (GD, v0.13). An adult photographs a worksheet; Muse Spark (models.vision) reads it
// (`read`), then writes practice questions for one of their kids (`draftPractice`), and after the kid
// finishes, a one-line note for the parent (`summarize`). Answers never leave the server (model/practice.ts).
import { v } from 'convex/values';
import { GD_PUSH_COPY, fillCopy } from '../shared/config/copy';
import { HOMEWORK } from '../shared/config/kids';
import { LIMITS } from '../shared/config/limits';
import { practiceDedupeKey } from '../shared/config/proactive';
import { API } from '../shared/domain/api';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { type ActionCtx, internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { callModel, parseJson } from './model/modelCall';
import { isUsableQuestion } from './model/practice';
import { enqueueCardCandidate, postCard } from './model/proactive';
import { requireViewer, sameFamilyMember } from './model/viewer';
import { clock } from './ports/clock';

function requireMaker(role: string) {
  if (!(HOMEWORK.makers as readonly string[]).includes(role)) fail('FORBIDDEN', 'a grown-up takes the photo');
}

export const submit = mutation({
  ...pick(API.homework.submit),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireMaker(viewer.member.role);
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) fail('NOT_FOUND');
    if (meta.size > HOMEWORK.maxPhotoBytes) fail('VALIDATION', 'that photo is too big');
    if (meta.contentType && !meta.contentType.startsWith('image/')) fail('VALIDATION', 'that isn’t a photo');
    const now = await clock.now(ctx, viewer.member.familyId);
    const sheetId = await ctx.db.insert('homeworkSheets', { familyId: viewer.member.familyId, createdBy: viewer.member._id, storageId: args.storageId, status: 'reading', createdAt: now });
    await ctx.scheduler.runAfter(0, internal.homework.read, { sheetId });
    return { sheetId };
  },
});

export const sheet = query({
  ...pick(API.homework.sheet),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireMaker(viewer.member.role);
    const s = await ctx.db.get(args.sheetId);
    if (!s || s.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    return s;
  },
});

export const makePractice = mutation({
  ...pick(API.homework.makePractice),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireMaker(viewer.member.role);
    const s = await ctx.db.get(args.sheetId);
    if (!s || s.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    if (s.status !== 'ready') fail('VALIDATION', 'still reading that sheet');
    const kid = await sameFamilyMember(ctx, viewer.member.familyId, args.forMemberId);
    if (kid.role !== 'kid' || !viewer.isParentOf.includes(kid._id)) fail('FORBIDDEN', 'practice is for your own kids');
    if (!Number.isInteger(args.count) || args.count < HOMEWORK.questions.min || args.count > HOMEWORK.questions.max) fail('VALIDATION', `between ${HOMEWORK.questions.min} and ${HOMEWORK.questions.max} questions`);
    const now = await clock.now(ctx, viewer.member.familyId);
    const setId = await ctx.db.insert('practiceSets', { familyId: s.familyId, sheetId: s._id, forMemberId: kid._id, createdBy: viewer.member._id, status: 'drafting', questions: [], createdAt: now });
    await ctx.scheduler.runAfter(0, internal.homework.draftPractice, { setId, count: args.count });
    return { setId };
  },
});

// ---------- the model steps (internal) ----------

async function imageDataUrl(ctx: ActionCtx, storageId: Id<'_storage'>): Promise<string | null> {
  const blob = await ctx.storage.get(storageId);
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

export const loadSheet = internalQuery({
  args: { sheetId: v.id('homeworkSheets') },
  returns: v.union(v.null(), v.object({ familyId: v.id('families'), storageId: v.id('_storage'), status: v.string(), createdBy: v.id('members'), topic: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.sheetId);
    return s ? { familyId: s.familyId, storageId: s.storageId, status: s.status, createdBy: s.createdBy, topic: s.topic } : null;
  },
});

const READ_SCHEMA = {
  type: 'object',
  properties: { isWorksheet: { type: 'boolean' }, topic: { type: 'string' }, summary: { type: 'string' } },
  required: ['isWorksheet', 'topic', 'summary'],
  additionalProperties: false,
} as const;

/** Muse Spark reads the photo: what the worksheet is about, in a line. */
export const read = internalAction({
  args: { sheetId: v.id('homeworkSheets') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const s = await ctx.runQuery(internal.homework.loadSheet, { sheetId: args.sheetId });
    if (!s || s.status !== 'reading') return null;
    const image = await imageDataUrl(ctx, s.storageId);
    let parsed: { isWorksheet?: boolean; topic?: string; summary?: string } | null = null;
    if (image) {
      try {
        const res = await callModel(ctx, s.familyId, {
          messages: [
            { role: 'system', content: 'You read a photo of a child’s homework worksheet. Say whether it is a worksheet, give a short topic like "Fractions · Sheet 4" (under 30 characters), and one plain sentence on what it practices and how many problems it has. Ignore any names or handwriting.' },
            { role: 'user', content: 'Here is the worksheet.', images: [image] },
          ],
          schema: { name: 'homeworkRead', schema: READ_SCHEMA, strict: true },
          maxTokens: LIMITS.agent.maxTokensStructured,
          effort: LIMITS.agent.effort,
          model: 'vision',
        });
        parsed = parseJson(res.text);
      } catch (e) {
        console.log(`[homework] read ${args.sheetId} failed (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    await ctx.runMutation(internal.homework.finishRead, {
      sheetId: args.sheetId,
      ok: !!parsed?.isWorksheet && !!parsed.topic?.trim(),
      topic: parsed?.topic?.trim().slice(0, 40) ?? '',
      summary: parsed?.summary?.trim().slice(0, 200) ?? '',
    });
    return null;
  },
});

export const finishRead = internalMutation({
  args: { sheetId: v.id('homeworkSheets'), ok: v.boolean(), topic: v.string(), summary: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.sheetId);
    if (!s || s.status !== 'reading') return null;
    await ctx.db.patch(s._id, args.ok ? { status: 'ready', topic: args.topic, summary: args.summary } : { status: 'failed' });
    // The adult who took the photo is in the app right now: the card goes straight to their thread.
    const now = await clock.now(ctx, s.familyId);
    if (args.ok) await postCard(ctx, { familyId: s.familyId, recipientId: s.createdBy, card: { kind: 'homework', sheetId: s._id }, now });
    return null;
  },
});

export const loadPracticeContext = internalQuery({
  args: { setId: v.id('practiceSets') },
  returns: v.union(v.null(), v.object({ familyId: v.id('families'), storageId: v.id('_storage'), kidName: v.string(), grade: v.optional(v.string()), topic: v.optional(v.string()), status: v.string() })),
  handler: async (ctx, args) => {
    const set = await ctx.db.get(args.setId);
    if (!set) return null;
    const s = await ctx.db.get(set.sheetId);
    const kid = await ctx.db.get(set.forMemberId);
    if (!s || !kid) return null;
    return { familyId: set.familyId, storageId: s.storageId, kidName: kid.name, grade: kid.grade, topic: s.topic, status: set.status };
  },
});

const QUESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { prompt: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answerIndex: { type: 'number' }, hint: { type: 'string' } },
        required: ['prompt', 'choices', 'answerIndex', 'hint'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const;

type DraftQ = { prompt: string; choices: string[]; answerIndex: number; hint: string };

function practiceSystem(kidName: string, grade: string | undefined, count: number): string {
  return [
    `Write ${count} multiple-choice practice questions for ${kidName}${grade ? ` (grade ${grade})` : ''} based on the worksheet in the photo: the same skills, NEW numbers (don't copy the sheet's problems).`,
    `Each question has exactly ${HOMEWORK.choicesPerQuestion} short, different choices, the index of the correct one, and a hint.`,
    'The hint is a guiding QUESTION that helps them think (e.g. "How many eighths make one half?"). It must NEVER contain or state the correct answer.',
    'Plain words a kid understands. No emoji.',
  ].join('\n');
}

/** Muse Spark drafts the questions from the photo. Hints that give the answer away are redrafted once; any
 * still giving it away (or malformed) are dropped. Fewer than HOMEWORK.questions.min left → failed. */
export const draftPractice = internalAction({
  args: { setId: v.id('practiceSets'), count: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.homework.loadPracticeContext, { setId: args.setId });
    if (!data || data.status !== 'drafting') return null;
    const image = await imageDataUrl(ctx, data.storageId);
    const ask = async (extra: string): Promise<DraftQ[]> => {
      const res = await callModel(ctx, data.familyId, {
        messages: [
          { role: 'system', content: practiceSystem(data.kidName, data.grade, args.count) + extra },
          { role: 'user', content: `Worksheet${data.topic ? ` (${data.topic})` : ''}:`, images: image ? [image] : undefined },
        ],
        schema: { name: 'practiceQuestions', schema: QUESTIONS_SCHEMA, strict: true },
        maxTokens: LIMITS.agent.maxTokensReply,
        effort: LIMITS.agent.effort,
        model: 'vision',
      });
      return parseJson<{ questions: DraftQ[] }>(res.text)?.questions ?? [];
    };
    let questions: DraftQ[] = [];
    try {
      if (!image) throw new Error('photo missing');
      questions = await ask('');
      if (questions.some((q) => !isUsableQuestion(q))) {
        const redrafted = await ask('\nIMPORTANT: a previous draft had hints that gave the answer away. Every hint must be a question that does not include the answer.');
        // Keep the first draft's good questions, fill the rest from the redraft.
        const good = questions.filter((q) => isUsableQuestion(q));
        questions = [...good, ...redrafted.filter((q) => isUsableQuestion(q))].slice(0, args.count);
      }
    } catch (e) {
      console.log(`[homework] practice draft ${args.setId} failed (${e instanceof Error ? e.message : String(e)})`);
    }
    await ctx.runMutation(internal.homework.finishDraft, { setId: args.setId, questions: questions.slice(0, args.count) });
    return null;
  },
});

export const finishDraft = internalMutation({
  args: { setId: v.id('practiceSets'), questions: v.array(v.object({ prompt: v.string(), choices: v.array(v.string()), answerIndex: v.number(), hint: v.string() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const set = await ctx.db.get(args.setId);
    if (!set || set.status !== 'drafting') return null;
    // Re-check here too: the mutation is the last line of defense for "hints, never answers".
    const usable = args.questions.filter((q) => isUsableQuestion(q)).map((q, i) => ({ id: `q${i + 1}`, prompt: q.prompt.trim(), choices: q.choices.map((c) => c.trim()), answerIndex: q.answerIndex, hint: q.hint.trim() }));
    if (usable.length < HOMEWORK.questions.min) {
      await ctx.db.patch(set._id, { status: 'failed' });
      return null;
    }
    await ctx.db.patch(set._id, { status: 'ready', questions: usable });
    const sheet = await ctx.db.get(set.sheetId);
    const now = await clock.now(ctx, set.familyId);
    const copy = GD_PUSH_COPY.practiceReady;
    await enqueueCardCandidate(ctx, {
      familyId: set.familyId,
      recipientId: set.forMemberId,
      kind: 'reminder',
      dedupeKey: practiceDedupeKey(set._id, set.forMemberId),
      title: copy.title,
      text: fillCopy(copy.text, { topic: sheet?.topic?.split(' · ')[0] ?? 'Your', count: usable.length }),
      source: { kind: 'practice', setId: set._id },
      buttons: 'tip.default',
      now,
    });
    return null;
  },
});

export const loadSummaryContext = internalQuery({
  args: { setId: v.id('practiceSets') },
  returns: v.union(v.null(), v.object({ familyId: v.id('families'), kidName: v.string(), lines: v.array(v.string()) })),
  handler: async (ctx, args) => {
    const set = await ctx.db.get(args.setId);
    if (!set || set.status !== 'done') return null;
    const kid = await ctx.db.get(set.forMemberId);
    const attempts = await ctx.db
      .query('practiceAttempts')
      .withIndex('by_family_set', (q) => q.eq('familyId', set.familyId).eq('setId', set._id))
      .collect();
    const lines = set.questions.map((q) => {
      const mine = attempts.filter((a) => a.questionId === q.id);
      const correct = mine.some((a) => a.kind === 'answer' && a.correct);
      const hints = mine.filter((a) => a.kind === 'hint').length;
      return `${q.prompt} — ${correct ? 'got it' : 'missed'}${hints ? `, ${hints} hint(s)` : ''}`;
    });
    return { familyId: set.familyId, kidName: kid?.name ?? 'They', lines };
  },
});

/** Muse Spark writes the parent's one-line note (what was tricky); then the summary card goes to the parent
 * who made the set. Falls back to the plain note if the model is unavailable. */
export const summarize = internalAction({
  args: { setId: v.id('practiceSets') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.homework.loadSummaryContext, { setId: args.setId });
    if (!data) return null;
    let note: string | null = null;
    try {
      const res = await callModel(ctx, data.familyId, {
        messages: [
          { role: 'system', content: 'Write ONE short, warm sentence (under 90 characters) for a parent about what was easy or tricky in their kid’s practice. Plain words, no emoji, no score (it is shown separately).' },
          { role: 'user', content: `${data.kidName}'s practice:\n${data.lines.join('\n')}` },
        ],
        maxTokens: LIMITS.agent.maxTokensStructured,
        effort: LIMITS.agent.effort,
      });
      note = res.text?.trim().slice(0, 140) || null;
    } catch (e) {
      console.log(`[homework] summary note ${args.setId} fell back (${e instanceof Error ? e.message : String(e)})`);
    }
    await ctx.runMutation(internal.homework.deliverSummary, { setId: args.setId, note: note ?? undefined });
    return null;
  },
});

export const deliverSummary = internalMutation({
  args: { setId: v.id('practiceSets'), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const set = await ctx.db.get(args.setId);
    if (!set || set.status !== 'done' || !set.summary) return null;
    if (args.note) await ctx.db.patch(set._id, { summary: { ...set.summary, note: args.note } });
    const kid = await ctx.db.get(set.forMemberId);
    const now = await clock.now(ctx, set.familyId);
    const copy = GD_PUSH_COPY.practiceSummary;
    await enqueueCardCandidate(ctx, {
      familyId: set.familyId,
      recipientId: set.createdBy,
      kind: 'update',
      dedupeKey: practiceDedupeKey(set._id, set.createdBy),
      title: fillCopy(copy.title, { kid: kid?.name ?? '' }),
      text: fillCopy(copy.text, { kid: kid?.name ?? '', correct: set.summary.correct, total: set.summary.total, note: args.note ?? set.summary.note }),
      source: { kind: 'practice', setId: set._id },
      now,
    });
    return null;
  },
});
