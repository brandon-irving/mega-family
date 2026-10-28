// GD evals (OpenDuet learning, docs/gates/GD.md backend task 10): run the REAL privacy gate and push judge
// against small synthetic labeled sets and commit precision/recall per model.
//
//   evals/privacyGate/cases.jsonl — memory facts labeled "sensitive" | "ok". Runs the production concern
//     classifier action (independent Muse Spark call + keyword backstop) exactly as a save does.
//   evals/pushJudge/cases.jsonl — trigger texts labeled "push" | "statement" | "drop". Runs the production
//     draft+judge prompt, parser and thresholds (convex/evals.ts judgeCase).
//
// Real calls, inside a local convex-test backend (spend recorded in its usage table, so the per-family cap
// applies). Run from the repo root through the secrets runner, which injects META_API_KEY without this
// script ever reading or printing it:
//   evals/kidSearch/cases.jsonl (G4) — kid search queries labeled "allowed" | "rephrase" | "blocked". Runs the
//     kid filter's query step (keyword backstop + model check, convex/evals.ts kidQueryCase); no web search.
//   node scripts/secrets.mjs run --only tool -- npx tsx evals/run.ts [privacyGate|pushJudge|kidSearch]
// Writes evals/<name>/results-<model>.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convexTest, type TestConvex } from 'convex-test';
import { MODELS } from '../shared/config/models';
import { internal } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import schema from '../convex/schema';
import { buildModules } from '../scripts/live/convexModules';

process.env.MEGA_MODEL_ADAPTER ??= 'real';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const TODAY = new Date().toISOString().slice(0, 10);

type Row = { id: string; label: string; predicted: string; detail: string };

function readCases<T>(name: string): T[] {
  return fs
    .readFileSync(path.join(DIR, name, 'cases.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

function prf(rows: Row[], positive: string) {
  const tp = rows.filter((r) => r.predicted === positive && r.label === positive).length;
  const fp = rows.filter((r) => r.predicted === positive && r.label !== positive).length;
  const fn = rows.filter((r) => r.predicted !== positive && r.label === positive).length;
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  return { tp, fp, fn, precision, recall };
}

function writeResults(name: string, title: string, classes: string[], rows: Row[], cents: number, note: string) {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const lines = [
    `# ${title} — ${MODELS.chat.model}`,
    '',
    `Run ${TODAY} on ${rows.length} synthetic labeled cases (\`cases.jsonl\`), real model calls. Cost: ${cents.toFixed(2)}¢.`,
    '',
    note,
    '',
    '| Class | Precision | Recall | TP | FP | FN |',
    '|---|---|---|---|---|---|',
    ...classes.map((c) => {
      const s = prf(rows, c);
      return `| ${c} | ${pct(s.precision)} | ${pct(s.recall)} | ${s.tp} | ${s.fp} | ${s.fn} |`;
    }),
    '',
    `Accuracy: ${pct(rows.filter((r) => r.predicted === r.label).length / rows.length)}`,
    '',
    '## Misses',
    '',
    ...(rows.filter((r) => r.predicted !== r.label).map((r) => `- \`${r.id}\` expected **${r.label}**, got **${r.predicted}** — ${r.detail}`) || []),
  ];
  if (!rows.some((r) => r.predicted !== r.label)) lines.push('- none');
  const out = path.join(DIR, name, `results-${MODELS.chat.model}.md`);
  fs.writeFileSync(out, `${lines.join('\n')}\n`);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

async function privacyGate(t: TestConvex<typeof schema>, familyId: Id<'families'>): Promise<number> {
  const cases = readCases<{ id: string; text: string; about: string[]; label: 'sensitive' | 'ok' }>('privacyGate');
  const rows: Row[] = [];
  for (const c of cases) {
    const r = await t.action(internal.agent.concernClassifier.classify, { familyId, text: c.text, aboutNames: c.about });
    rows.push({ id: c.id, label: c.label, predicted: r.category === 'ok' ? 'ok' : 'sensitive', detail: `${r.category} (${r.decidedBy}): "${c.text}"` });
  }
  const cents = await spentCents(t, familyId);
  writeResults('privacyGate', 'Privacy gate (concern classifier + keyword backstop)', ['sensitive', 'ok'], rows, cents, 'Positive class is **sensitive** (any non-"ok" category: never saved / saved as sensitive). A miss on "sensitive" is the costly one: something private could be treated as ordinary.');
  return cents;
}

async function pushJudge(t: TestConvex<typeof schema>, familyId: Id<'families'>): Promise<number> {
  const cases = readCases<{ id: string; source: 'reminder' | 'mattersTo' | 'checkin'; role: 'admin' | 'adult' | 'kid'; name: string; text: string; label: 'push' | 'statement' | 'drop' }>('pushJudge');
  const before = await spentCents(t, familyId);
  const rows: Row[] = [];
  for (const c of cases) {
    const r = await t.action(internal.evals.judgeCase, { familyId, source: c.source, role: c.role, name: c.name, text: c.text });
    rows.push({ id: c.id, label: c.label, predicted: r.delivery, detail: `${r.kind} score ${r.score.toFixed(2)}: "${c.text}"` });
  }
  const cents = (await spentCents(t, familyId)) - before;
  writeResults('pushJudge', 'Push judge (draft + judge, then the kind thresholds)', ['push', 'statement', 'drop'], rows, cents, 'Labels are a person\u2019s call on whether each message should interrupt (push), wait for the widget/Today (statement), or not be sent (drop). Kids only receive reminders, so other kinds to a kid are a drop by rule.');
  return cents;
}

async function kidSearch(t: TestConvex<typeof schema>, familyId: Id<'families'>): Promise<number> {
  const cases = readCases<{ id: string; query: string; label: 'allowed' | 'rephrase' | 'blocked' }>('kidSearch');
  const before = await spentCents(t, familyId);
  const rows: Row[] = [];
  for (const c of cases) {
    const r = await t.action(internal.evals.kidQueryCase, { familyId, query: c.query });
    rows.push({ id: c.id, label: c.label, predicted: r.verdict, detail: `${r.decidedBy}${r.detail ? ` (${r.detail})` : ''}: "${c.query}"` });
  }
  const cents = (await spentCents(t, familyId)) - before;
  writeResults('kidSearch', 'Kid search filter (query step: keyword backstop + model check)', ['blocked', 'rephrase', 'allowed'], rows, cents, 'The costly miss is a **blocked** query let through as allowed. A rephrase predicted for a "blocked" label still never searches the original words, and the answer check runs after the search either way.');
  return cents;
}

async function spentCents(t: TestConvex<typeof schema>, familyId: Id<'families'>): Promise<number> {
  const rows = await t.run((ctx) => ctx.db.query('usage').withIndex('by_family_day', (q) => q.eq('familyId', familyId)).collect());
  return rows.reduce((s, r) => s + r.cents, 0);
}

async function main() {
  if (process.env.MEGA_MODEL_ADAPTER === 'real' && !process.env.META_API_KEY) {
    console.error('META_API_KEY is not set (run this through scripts/secrets.mjs, see the header)');
    process.exit(2);
  }
  const which = process.argv[2];
  const t = convexTest(schema, buildModules());
  const { familyId } = await t.mutation(internal.seed.sampleFamily, {});
  if (!which || which === 'privacyGate') await privacyGate(t, familyId);
  if (!which || which === 'pushJudge') await pushJudge(t, familyId);
  if (!which || which === 'kidSearch') await kidSearch(t, familyId);
  const total = await spentCents(t, familyId);
  console.log(`total eval spend: ${total.toFixed(2)}¢`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
