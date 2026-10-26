// G2 small live check (task brief: "a SMALL live check (≤ 10 real calls total)"). Runs the real Meta Model
// API / Transcriber adapters (never the Fake ones) against a convex-test backend — no deployment needed;
// convex-test executes real handler code in this same Node process, including real `fetch` calls, which is
// exactly what we want to prove the adapters work end to end.
//
// Run through the secrets runner from this worktree, so META_API_KEY is injected without ever being read or
// printed by this script:
//   SECRETS_FILE=/Users/brandonirving/products/mega/.env.secrets node scripts/secrets.mjs run --only tool -- npx tsx scripts/live/g2LiveCheck.ts
//
// Real calls made: 1 agent turn (a tool-calling chat/completions call plus a final-reply call), 1 memory
// writer turn (1 structured call), 1 transcription (1 asr/transcribe call, plus 0+ small structured calls
// only for any spoken-mention token that lands in the "uncertain" band — see convex/agent/mentionResolver.
// ts). Well under the 10-call cap for a conversation this short.
//
// `convexTest` normally takes its `modules` map from Vite's `import.meta.glob` (used by every *.test.ts in
// this repo), which doesn't exist under plain `tsx`/Node — `buildModules` below is a small manual
// equivalent: every `.ts` file under convex/ (except `_generated`), keyed exactly the same way
// (`"./relative/path.ts"`) so convex-test's function-reference resolution works identically.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convexTest } from 'convex-test';
import type { Id } from '../../convex/_generated/dataModel';
import { api, internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';

// Respects an already-set value so this script can also be dry-run against the Fake adapters
// (MEGA_MODEL_ADAPTER=fake, any META_API_KEY) to sanity-check the plumbing before spending anything real.
process.env.MEGA_MODEL_ADAPTER ??= 'real';

const SAMPLE_WAV = '/Users/brandonirving/products/mega/scripts/smoke/sample.wav'; // main repo, not this worktree
const WEEK = '2026-10-25';
const CONVEX_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../convex');

function buildModules(): Record<string, () => Promise<unknown>> {
  const out: Record<string, () => Promise<unknown>> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full); // includes `_generated` — convex-test needs its entries present to find the module root
        continue;
      }
      // `.d.ts` files have no runtime JS to import; everything else real (`.ts`, and `_generated`'s `.js`) goes in.
      if (entry.name.endsWith('.d.ts') || !(entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) continue;
      const rel = path.relative(CONVEX_DIR, full).split(path.sep).join('/');
      out[`./${rel}`] = () => import(full);
    }
  };
  walk(CONVEX_DIR);
  return out;
}

async function main() {
  if (!process.env.META_API_KEY) {
    console.error('META_API_KEY is not set in this process (did you run this through scripts/secrets.mjs?)');
    process.exit(2);
  }

  const t = convexTest(schema, buildModules());
  const { familyId, members } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const adminId = members.admin as Id<'members'>;

  const thread = await t.run((ctx) =>
    ctx.db
      .query('threads')
      .withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', adminId))
      .unique(),
  );
  const mega = await t.run((ctx) =>
    ctx.db
      .query('megas')
      .withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', adminId))
      .unique(),
  );
  if (!thread || !mega) throw new Error('seed fixture missing thread/mega for admin');

  console.log('--- 1/3: one real agent turn (expects a lists_add tool call) ---');
  const turn = await t.action(internal.agent.loop.runTurn, {
    familyId,
    memberId: adminId,
    role: 'admin',
    megaId: mega._id,
    threadId: thread._id,
    userText: 'Please add milk to the groceries list.',
  });
  console.log('Reply text:', turn.text);
  const lists = await t.run((ctx) =>
    ctx.db
      .query('lists')
      .withIndex('by_family', (q) => q.eq('familyId', familyId))
      .collect(),
  );
  const groceries = lists.find((l) => l.name.toLowerCase() === 'groceries');
  const items = groceries
    ? await t.run((ctx) =>
        ctx.db
          .query('listItems')
          .withIndex('by_family_list', (q) => q.eq('familyId', familyId).eq('listId', groceries._id))
          .collect(),
      )
    : [];
  const gotMilk = items.some((i) => i.text.toLowerCase().includes('milk'));
  console.log(
    'lists.add really ran:',
    gotMilk,
    '(items on Groceries:',
    items.map((i) => i.text),
    ')',
  );
  if (!gotMilk) throw new Error('live check failed: milk was not added to the Groceries list');

  console.log('\n--- 2/3: one real memory-writer turn ---');
  const anyMessage = await t.run((ctx) =>
    ctx.db
      .query('messages')
      .withIndex('by_family_thread_at', (q) => q.eq('familyId', familyId).eq('threadId', thread._id))
      .first(),
  );
  if (!anyMessage) throw new Error('seed fixture missing a message to attach a save chip to');
  await t.action(internal.agent.writer.run, {
    familyId,
    memberId: adminId,
    memberName: 'Admin',
    role: 'admin',
    megaId: mega._id,
    threadId: thread._id,
    replyMessageId: anyMessage._id,
    userText: 'From now on, remember that I like my coffee black.',
    replyText: "Got it, I'll remember that.",
  });
  const preferenceMemories = await t.run((ctx) =>
    ctx.db
      .query('memories')
      .withIndex('by_family_kind', (q) => q.eq('familyId', familyId).eq('kind', 'preference'))
      .collect(),
  );
  const savedCoffee = preferenceMemories.some((m) => m.text.toLowerCase().includes('coffee'));
  console.log(
    'memory writer saved a coffee preference:',
    savedCoffee,
    '(preference memories:',
    preferenceMemories.map((m) => m.text),
    ')',
  );

  console.log('\n--- 3/3: one real transcription of scripts/smoke/sample.wav ---');
  const wavBytes = fs.readFileSync(SAMPLE_WAV);
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob([wavBytes], { type: 'audio/wav' })));
  const transcribed = await t.withIdentity({ subject: 'sample:admin' }).action(api.talk.transcribe, { storageId });
  console.log('Transcript:', transcribed.text);
  console.log('Spoken mentions found:', transcribed.mentions);

  const usageRows = await t.run((ctx) =>
    ctx.db
      .query('usage')
      .withIndex('by_family_day', (q) => q.eq('familyId', familyId))
      .collect(),
  );
  const cents = usageRows.reduce((sum, r) => sum + r.cents, 0);
  console.log(`\nTotal recorded spend this run: ${cents.toFixed(4)} cents`);
  console.log(path.basename(SAMPLE_WAV), 'bytes read:', wavBytes.length);
}

main().catch((e) => {
  console.error('LIVE CHECK FAILED:', e);
  process.exit(1);
});
