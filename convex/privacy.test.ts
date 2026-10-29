/// <reference types="vite/client" />
// Milestone D. The privacy test grid, generated from the API map (shared/domain/api.ts), not written by
// hand: for every function, every viewer category (each member of family A, a member of family B, no
// identity, a signed-in identity with no `members` row) is tried against args built from BOTH seeded
// families' real documents. Two invariants hold for every single call in the grid:
//   1. A successful result never contains an `_id` belonging to the *other* family — ids are globally
//      unique per table and the two families are seeded independently (seed.test.ts already checks this
//      invariant for a single family's own data), so any cross-family id showing up in a response is
//      unambiguously a leak.
//   2. A rejected call always throws `ConvexError` with one of CONTRACT.md §9's codes — never an
//      unhandled crash.
// On top of the generic grid, targeted checks cover rule (2) from the task brief that a generic id-diff
// can't catch on its own: personal memories / kidControls / a kid's thread, which stay *within* one
// family's id-space but must still only reach the people the rules allow.
import { register as registerPersistentTextStreaming } from '@convex-dev/persistent-text-streaming/test';
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, type Validator } from 'convex/values';
import { convexTest } from 'convex-test';
import { beforeAll, describe, expect, test } from 'vitest';
import { API } from '../shared/domain/api';
import { TABLES, type TableName } from '../shared/domain/tables';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

// ---------- generic arg builder: walks a function's validators and fills them from seeded docs ----------

type AnyDoc = Record<string, unknown> & { _id: string };
type DocsByTable = Partial<Record<TableName | '_storage', AnyDoc[]>>;
type AnyValidator = Validator<unknown, 'required' | 'optional', string>;

const NUMERIC_HINTS: Record<string, number> = {
  from: Date.now(),
  to: Date.now() + 2 * 60 * 60_000,
  start: Date.now(),
  end: Date.now() + 60 * 60_000,
  dueAt: Date.now() + 60 * 60_000,
  at: Date.now(),
};

/** Fills one validator with a concrete value, preferring real seeded ids over made-up ones so the grid
 * actually exercises each function's permission checks instead of just failing on bad shapes. */
function fillValidator(val: AnyValidator, docs: DocsByTable, argName: string): unknown {
  if ((val as unknown) === (paginationOptsValidator as unknown)) return { numItems: 50, cursor: null };
  const v = val as unknown as {
    kind: string;
    tableName?: string;
    fields?: Record<string, AnyValidator>;
    element?: AnyValidator;
    members?: AnyValidator[];
    value?: unknown;
  };

  switch (v.kind) {
    case 'id': {
      const row = docs[(v.tableName as TableName | '_storage') ?? '']?.[0];
      return row?._id;
    }
    case 'array': {
      const filled = fillValidator(v.element!, docs, argName);
      return filled === undefined ? [] : [filled];
    }
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, fieldVal] of Object.entries(v.fields!)) {
        if (fieldVal.isOptional === 'optional') continue; // leave optional sub-fields out; keeps shapes valid
        out[k] = fillValidator(fieldVal, docs, k);
      }
      return out;
    }
    case 'union':
      return fillValidator(v.members![0], docs, argName);
    case 'literal':
      return v.value;
    case 'string':
      return NUMERIC_HINTS[argName] !== undefined ? String(NUMERIC_HINTS[argName]) : 'privacy-grid';
    case 'float64':
      return NUMERIC_HINTS[argName] ?? 1;
    case 'int64':
      return 1n;
    case 'boolean':
      return true;
    case 'bytes':
      return new ArrayBuffer(0);
    case 'any':
      return {};
    case 'record':
      return {};
    case 'null':
      return null;
    default:
      return undefined;
  }
}

function buildArgs(args: Record<string, AnyValidator>, docs: DocsByTable): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, val] of Object.entries(args)) {
    if (val.isOptional === 'optional') continue;
    const filled = fillValidator(val, docs, name);
    if (filled !== undefined) out[name] = filled;
  }
  return out;
}

/** True when a required arg (or a required field nested inside one) couldn't be filled from seeded docs. */
function hasHole(built: Record<string, unknown>, args: Record<string, AnyValidator>): boolean {
  const holey = (value: unknown): boolean =>
    value === undefined || (Array.isArray(value) ? value.some(holey) : !!value && typeof value === 'object' && !(value instanceof ArrayBuffer) && Object.values(value).some(holey));
  return Object.entries(args).some(([name, val]) => val.isOptional !== 'optional' && holey(built[name]));
}

// ---------- error-code + leak assertions ----------

const KNOWN_CODES = new Set(['UNAUTHENTICATED', 'NOT_A_MEMBER', 'FORBIDDEN', 'NOT_FOUND', 'INVALID_INVITE', 'WRONG_PARENT_CODE', 'RATE_LIMITED', 'BUDGET_EXCEEDED', 'KID_BLOCKED', 'VALIDATION']);

function codeOf(err: unknown): string | undefined {
  const data = err instanceof ConvexError ? (err.data as { code?: string } | undefined) : (err as { data?: { code?: string } } | undefined)?.data;
  return data?.code;
}

function collectStrings(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') out.add(value);
  else if (Array.isArray(value)) for (const x of value) collectStrings(x, out);
  else if (value && typeof value === 'object') for (const x of Object.values(value)) collectStrings(x, out);
}

/** Fails with a message naming the function, the viewer and the leaked id — not a bare assertion failure. */
function assertNoLeak(fnName: string, viewerLabel: string, result: unknown, forbiddenIds: Set<string>) {
  const strings = new Set<string>();
  collectStrings(result, strings);
  for (const id of forbiddenIds) {
    if (strings.has(id)) throw new Error(`PRIVACY LEAK: ${fnName} returned ${id} (belongs to the other family) to viewer "${viewerLabel}"`);
  }
}

// ---------- fixtures: two families with distinct per-family authIds, and their full document sets ----------

type Family = { key: 'A' | 'B'; familyId: Id<'families'>; members: Record<string, Id<'members'>>; docs: DocsByTable; ids: Set<string> };

async function loadFamily(t: ReturnType<typeof convexTest>, key: 'A' | 'B', familyId: Id<'families'>, members: Record<string, Id<'members'>>): Promise<Family> {
  const docs: DocsByTable = {};
  const ids = new Set<string>();
  ids.add(familyId);
  for (const table of Object.keys(TABLES) as TableName[]) {
    const rows = (await t.run((ctx) => ctx.db.query(table).collect())) as AnyDoc[];
    const mine = table === 'families' ? rows.filter((r) => r._id === familyId) : rows.filter((r) => r.familyId === familyId);
    docs[table] = mine;
    for (const row of mine) ids.add(row._id);
  }
  // `images` isn't seeded by sampleFamily; add one so images.get has something real to probe cross-family.
  const imageId = await t.run((ctx) => ctx.db.insert('images', { familyId, createdBy: members.admin, purpose: 'poster', prompt: 'a poster', status: 'queued' }));
  docs.images = [(await t.run((ctx) => ctx.db.get(imageId))) as unknown as AnyDoc];
  ids.add(imageId);
  return { key, familyId, members, docs, ids };
}

type Viewer = { label: string; subject?: string; family?: Family };

describe('Milestone D: privacy grid', () => {
  let t: ReturnType<typeof convexTest>;
  let famA: Family;
  let famB: Family;
  let viewers: Viewer[];

  beforeAll(async () => {
    t = convexTest(schema, modules);
    registerPersistentTextStreaming(t); // chat.send/chat.streamBody use the real component
    // GD: each family's homework sheet needs a stored photo (a mutation can't store one), so the grid can
    // probe homework.*/practice.* too — zero skipped functions (docs/gates/GD.md invariant 9).
    const photoA = await t.run((ctx) => ctx.storage.store(new Blob(['fixture-photo-a'], { type: 'image/png' })));
    const photoB = await t.run((ctx) => ctx.storage.store(new Blob(['fixture-photo-b'], { type: 'image/png' })));
    const a = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK, homeworkStorageId: photoA });
    const b = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK, homeworkStorageId: photoB });

    // seed.sampleFamily always assigns authId `sample:<key>` — fine for one family, but two seeded
    // families in the same convexTest instance would collide on "sample:admin" etc. Give family B's
    // members distinct authIds so each viewer in the grid resolves to exactly one member row, the same
    // way two real families never share a Better Auth subject.
    for (const [key, memberId] of Object.entries(b.members)) {
      await t.run((ctx) => ctx.db.patch(memberId, { authId: `sample:B:${key}` }));
    }

    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(['privacy-grid-fixture'])));

    famA = await loadFamily(t, 'A', a.familyId, a.members as unknown as Record<string, Id<'members'>>);
    famB = await loadFamily(t, 'B', b.familyId, b.members as unknown as Record<string, Id<'members'>>);
    // Storage isn't family-scoped in the schema, so the same object is "valid" for both — only the rows
    // that reference it carry family ownership, which is what the leak check actually cares about.
    famA.docs._storage = [{ _id: storageId as unknown as string }];
    famB.docs._storage = [{ _id: storageId as unknown as string }];

    viewers = [
      { label: 'A:admin', subject: 'sample:admin', family: famA },
      { label: 'A:partner', subject: 'sample:partner', family: famA },
      { label: 'A:twin1', subject: 'sample:twin1', family: famA },
      { label: 'A:twin2', subject: 'sample:twin2', family: famA },
      { label: 'B:admin', subject: 'sample:B:admin', family: famB },
      { label: 'unauthenticated' },
      { label: 'stray (signed in, no member row)', subject: 'stray-nobody' },
    ];
  }, 30_000);

  test('setup sanity: the two seeded families share no document id', () => {
    for (const id of famA.ids) expect(famB.ids.has(id), `shared id ${id}`).toBe(false);
  });

  // ---------- the generated grid: one function reference + its args/kind per API entry ----------

  type FnKind = 'query' | 'mutation' | 'action';
  const functions: { mod: string; name: string; kind: FnKind; args: Record<string, AnyValidator> }[] = [];
  for (const [mod, fns] of Object.entries(API)) {
    for (const [name, entry] of Object.entries(fns as Record<string, { kind: FnKind; args: Record<string, AnyValidator> }>)) {
      functions.push({ mod, name, kind: entry.kind, args: entry.args });
    }
  }

  type Caller = Record<FnKind, (ref: unknown, args: unknown) => Promise<unknown>>;

  for (const fn of functions) {
    test(`${fn.mod}.${fn.name}: no cross-family leak, no uncoded crash, for every viewer x every family's args`, async () => {
      const ref = (api as unknown as Record<string, Record<string, unknown>>)[fn.mod][fn.name];
      // GD (invariant 9): every function must be probe-able. One whose id args point at a table the seed
      // doesn't fill can't be (Convex rejects the missing arg before any permission check runs) — that's a
      // gap in the seed, so it FAILS here rather than being skipped.
      expect([famA, famB].some((f) => hasHole(buildArgs(fn.args, f.docs), fn.args)), `${fn.mod}.${fn.name}: the seed leaves one of its id args empty, so the grid can't probe it`).toBe(false);

      for (const viewer of viewers) {
        const asViewer = (viewer.subject ? t.withIdentity({ subject: viewer.subject }) : t) as unknown as Caller;

        for (const argsFamily of [famA, famB] as const) {
          const args = buildArgs(fn.args, argsFamily.docs);
          // The family whose ids must never appear in a successful result: whichever of A/B the viewer
          // does NOT belong to (an unauthenticated/stray viewer belongs to neither, so both are "other").
          const forbidden = viewer.family ? (viewer.family.key === 'A' ? famB.ids : famA.ids) : new Set([...famA.ids, ...famB.ids]);

          let result: unknown;
          let error: unknown;
          try {
            result = await asViewer[fn.kind](ref, args);
          } catch (e) {
            error = e;
          }

          if (error !== undefined) {
            const c = codeOf(error);
            expect(c, `${fn.mod}.${fn.name} (viewer=${viewer.label}, argsFamily=${argsFamily.key}) threw without a ConvexError code: ${String(error)}`).toBeDefined();
            expect(KNOWN_CODES.has(c!), `${fn.mod}.${fn.name} (viewer=${viewer.label}) threw an unrecognized code "${c}"`).toBe(true);
          } else {
            assertNoLeak(`${fn.mod}.${fn.name} (argsFamily=${argsFamily.key})`, viewer.label, result, forbidden);
          }
        }
      }
    });
  }

  // ---------- targeted checks: same-family visibility rules a cross-family id-diff can't catch ----------

  describe('within-family visibility', () => {
    test("memories.list(scope: 'personal') never returns another member's personal memory", async () => {
      const twin1Memories = await t.withIdentity({ subject: 'sample:twin1' }).query(api.memories.list, { scope: 'personal', paginationOpts: { numItems: 50, cursor: null } });
      const twin2PersonalMemory = famA.docs.memories!.find((m) => (m as unknown as { scope: string; scopeKey: string }).scopeKey === `${famA.familyId}:personal:${famA.members.twin2}`);
      expect(twin2PersonalMemory, 'fixture sanity: twin2 should have a personal memory').toBeDefined();
      const ids = new Set(twin1Memories.page.map((m) => m._id));
      expect(ids.has(twin2PersonalMemory!._id as never), "twin1's memories.list leaked twin2's personal memory").toBe(false);
    });

    test('family.member only reveals kidControls to the kid\'s own parents', async () => {
      const toddlerId = famA.members.toddler;
      const byAdmin = await t.withIdentity({ subject: 'sample:admin' }).query(api.family.member, { memberId: toddlerId });
      expect(byAdmin.kidControls, 'a parent should see their kid\'s controls').not.toBeNull();

      const bySibling = await t.withIdentity({ subject: 'sample:twin1' }).query(api.family.member, { memberId: famA.members.twin2 });
      expect(bySibling.kidControls, 'a sibling (not a parent) must not see kidControls').toBeNull();
    });

    test("family.kidThread is FORBIDDEN for a non-parent sibling", async () => {
      const err = await t
        .withIdentity({ subject: 'sample:twin1' })
        .query(api.family.kidThread, { memberId: famA.members.twin2, paginationOpts: { numItems: 50, cursor: null } })
        .catch((e) => e);
      expect(codeOf(err)).toBe('FORBIDDEN');
    });

    test('family.kidThread for a member with no login (the toddler) is an empty page, not an error, for an actual parent', async () => {
      const page = await t.withIdentity({ subject: 'sample:admin' }).query(api.family.kidThread, { memberId: famA.members.toddler, paginationOpts: { numItems: 50, cursor: null } });
      expect(page.page).toEqual([]);
    });

    test('sharing.get is null for a kid (no sharing row), and never leaks an adult\'s sharing row to a kid', async () => {
      const kidSharing = await t.withIdentity({ subject: 'sample:twin1' }).query(api.sharing.get, {});
      expect(kidSharing).toBeNull();
    });

    // ---------- notifications.get (G1 fix): the generic grid above already proves it never leaks a
    // cross-family notification; this adds the same-family rule the grid can't catch — a sibling who is
    // NOT the recipient must not be able to read it either. ----------

    test('notifications.get: the recipient can read it, a non-recipient sibling gets FORBIDDEN', async () => {
      const notification = (famA.docs.notifications as unknown as { _id: Id<'notifications'>; recipientId: Id<'members'> }[]).find(
        (n) => n.recipientId === famA.members.admin,
      );
      expect(notification, 'fixture sanity: the seeded milk request pushes a notification to admin').toBeDefined();

      const byRecipient = await t.withIdentity({ subject: 'sample:admin' }).query(api.notifications.get, { notificationId: notification!._id });
      expect(byRecipient._id).toBe(notification!._id);

      const err = await t
        .withIdentity({ subject: 'sample:twin1' })
        .query(api.notifications.get, { notificationId: notification!._id })
        .catch((e) => e);
      expect(codeOf(err)).toBe('FORBIDDEN');
    });

    // ---------- same-family memory scope grid (task brief rule 2): the cross-family id-diff above can't
    // catch a kid or sibling seeing a memory that's within their OWN family's id-space but still outside
    // the scopes `readableScopeKeys` (convex/model/memoryAccess.ts) says they may read. ----------

    function memoryTextsFor(subject: string) {
      return t
        .withIdentity({ subject })
        .query(api.memories.list, { paginationOpts: { numItems: 50, cursor: null } })
        .then((page) => page.page.map((m) => m.text));
    }

    test('memories.list never returns an adults-scope memory to a kid, even unfiltered', async () => {
      const adultsOnly = (famA.docs.memories as unknown as { scope: string; text: string }[]).filter((m) => m.scope === 'adults');
      expect(adultsOnly.length, 'fixture sanity: sampleFamily seeds at least one adults-scope memory').toBeGreaterThan(0);

      const twin1Texts = await memoryTextsFor('sample:twin1');
      for (const m of adultsOnly) expect(twin1Texts, `kid (twin1) should never see adults-scope memory "${m.text}"`).not.toContain(m.text);
    });

    test('memories.list never returns a shared memory to a member who is not its grantee', async () => {
      const sharedMemory = (famA.docs.memories as unknown as { scope: string; text: string }[]).find((m) => m.scope === 'shared');
      expect(sharedMemory, 'fixture sanity: sampleFamily seeds an admin -> partner shared memory').toBeDefined();

      const twin1Texts = await memoryTextsFor('sample:twin1');
      expect(twin1Texts, 'twin1 is not a grantee of the admin -> partner share').not.toContain(sharedMemory!.text);

      const twin2Texts = await memoryTextsFor('sample:twin2');
      expect(twin2Texts, 'twin2 is not a grantee of the admin -> partner share').not.toContain(sharedMemory!.text);
    });

    // ---------- GD (CONTRACT v0.13, invariant 9): one within-family row per new table. The generic grid
    // above proves no cross-family leak; these prove who INSIDE the family can read each one. ----------

    const A = (k: 'admin' | 'partner' | 'twin1' | 'twin2') => t.withIdentity({ subject: `sample:${k}` });
    const firstA = <T,>(table: string) => (famA.docs as Record<string, unknown[]>)[table][0] as T & { _id: string };
    const refused = async (p: Promise<unknown>) => codeOf(await p.then(() => 'ok').catch((e) => e));

    test('GD calendar layers (events): a private event is visible only to its owner, even to people in its who', async () => {
      // A fresh one: the generic grid above legitimately ran the owner's own share on the seeded Dentist.
      const start = Date.parse('2026-10-29T20:00:00Z');
      const eventId = await t.run((ctx) =>
        ctx.db.insert('events', { familyId: famA.familyId, title: 'Private grid check', start, end: start + 3_600_000, who: [famA.members.admin, famA.members.partner, famA.members.twin1], source: 'mega', createdBy: famA.members.admin, ownerId: famA.members.admin, scope: 'personal', cancelled: false }),
      );
      const window = { from: start - 86_400_000, to: start + 86_400_000 };
      expect((await A('admin').query(api.calendar.range, window)).map((e) => e._id)).toContain(eventId);
      for (const k of ['partner', 'twin1', 'twin2'] as const) expect((await A(k).query(api.calendar.range, window)).map((e) => e._id)).not.toContain(eventId);
    });

    test('GD shareSuggestions + shareActions: only the owner reads a suggestion; no public function returns shareActions', async () => {
      const s = firstA<{ ownerId: string }>('shareSuggestions');
      for (const k of ['partner', 'twin1'] as const) expect(await refused(A(k).query(api.shareSuggestions.get, { suggestionId: s._id as Id<'shareSuggestions'> }))).toBe('FORBIDDEN');
      expect(Object.keys(API)).not.toContain('shareActions');
    });

    test('GD collisions are internal (no public module) and proposals are adults-only', async () => {
      expect(Object.keys(API)).not.toContain('collisions');
      const p = firstA<object>('proposals');
      for (const k of ['twin1', 'twin2'] as const) expect(await refused(A(k).query(api.proposals.get, { proposalId: p._id as Id<'proposals'> }))).toBe('FORBIDDEN');
    });

    test('GD giftIdeas: never to the birthday person or any kid', async () => {
      const g = firstA<object>('giftIdeas');
      for (const k of ['twin1', 'twin2'] as const) expect(await refused(A(k).query(api.gifts.get, { giftIdeasId: g._id as Id<'giftIdeas'> }))).toBe('FORBIDDEN');
    });

    test('GD homeworkSheets: adults only', async () => {
      const h = firstA<object>('homeworkSheets');
      expect(await refused(A('twin1').query(api.homework.sheet, { sheetId: h._id as Id<'homeworkSheets'> }))).toBe('FORBIDDEN');
    });

    test('GD practiceSets + practiceAttempts: the kid and their parents only, and never the answer', async () => {
      const set = firstA<{ forMemberId: string }>('practiceSets');
      const sibling = set.forMemberId === famA.members.twin1 ? 'twin2' : 'twin1';
      expect(await refused(A(sibling).query(api.practice.get, { setId: set._id as Id<'practiceSets'> }))).toBe('FORBIDDEN');
      const view = await A('admin').query(api.practice.get, { setId: set._id as Id<'practiceSets'> });
      expect(JSON.stringify(view)).not.toContain('answerIndex');
    });

    test('GD chores + choreClaims: a kid sees only their own', async () => {
      const claim = firstA<{ forMemberId: string }>('choreClaims');
      const sibling = claim.forMemberId === famA.members.twin1 ? 'twin2' : 'twin1';
      expect(await refused(A(sibling).query(api.chores.claim, { claimId: claim._id as Id<'choreClaims'> }))).toBe('FORBIDDEN');
      expect(await refused(A(sibling).query(api.chores.list, { memberId: claim.forMemberId as Id<'members'> }))).toBe('FORBIDDEN');
    });

    test('GD routines + routineRuns: a kid sees only their own', async () => {
      const run = firstA<{ memberId: string }>('routineRuns');
      const sibling = run.memberId === famA.members.twin1 ? 'twin2' : 'twin1';
      expect(await refused(A(sibling).query(api.routines.today, { kind: 'morning', memberId: run.memberId as Id<'members'> }))).toBe('FORBIDDEN');
      expect(await refused(A(sibling).mutation(api.routines.check, { runId: run._id as Id<'routineRuns'>, stepId: 'teeth', done: true }))).toBe('FORBIDDEN');
    });

    test('GD bucksLedger + purchases: a kid sees only their own balance; the Store is kids-only', async () => {
      expect(await refused(A('twin2').query(api.bucks.balance, { memberId: famA.members.twin1 }))).toBe('FORBIDDEN');
      expect(await refused(A('admin').query(api.store.catalog, {}))).toBe('FORBIDDEN');
    });

    test('G4 places: every member reads them; a kid can never add, edit or remove one', async () => {
      // (the grid above has already run every mutation, so read the current rows rather than the setup snapshot)
      const current = ((await t.run((ctx) => ctx.db.query('places').collect())) as unknown as { _id: Id<'places'>; familyId: string }[]).filter((p) => p.familyId === famA.familyId);
      const place = current[0];
      expect((await A('twin1').query(api.places.list, {})).length).toBe(current.length);
      expect(await refused(A('twin1').mutation(api.places.remove, { placeId: place._id as Id<'places'> }))).toBe('FORBIDDEN');
      expect(await refused(A('twin2').mutation(api.places.upsert, { kind: 'other', label: 'Park', address: 'A park' }))).toBe('FORBIDDEN');
    });

    test("G4 travelChecks: a private event's travel is NOT_FOUND to everyone but its owner", async () => {
      // A fresh private event (the grid's own probes may already have shared the seeded one).
      const placeId = ((await t.run((ctx) => ctx.db.query('places').collect())) as unknown as { _id: Id<'places'>; familyId: string }[]).find((p) => p.familyId === famA.familyId)?._id;
      const privateId = (await t.run((ctx) =>
        ctx.db.insert('events', { familyId: famA.familyId, title: 'Private errand', start: 4_102_444_800_000, who: [famA.members.admin, famA.members.partner], placeId, source: 'mega', createdBy: famA.members.admin, scope: 'personal', ownerId: famA.members.admin, cancelled: false } as never),
      )) as Id<'events'>;
      expect(await refused(A('admin').query(api.travel.forEvent, { eventId: privateId }))).toBeUndefined();
      for (const k of ['partner', 'twin1', 'twin2'] as const) expect(await refused(A(k).query(api.travel.forEvent, { eventId: privateId })), k).toBe('NOT_FOUND');
    });

    test("G4 searchLog: a sibling can't read a kid's searches; a parent sees only blocked/rephrased ones", async () => {
      expect(await refused(A('twin1').query(api.search.log, { memberId: famA.members.twin2, paginationOpts: { numItems: 20, cursor: null } }))).toBe('FORBIDDEN');
      expect(await refused(A('partner').query(api.search.log, { memberId: famA.members.admin, paginationOpts: { numItems: 20, cursor: null } }))).toBe('FORBIDDEN');
      const parentView = await A('admin').query(api.search.log, { memberId: famA.members.twin2, paginationOpts: { numItems: 20, cursor: null } });
      expect(parentView.page.every((r) => r.outcome === 'blocked' || r.outcome === 'rephrased')).toBe(true);
    });

    test('G4 weatherCache: no public function returns raw provider data', async () => {
      const view = await A('twin1').query(api.weather.get, {});
      const strings = new Set<string>();
      collectStrings(view, strings);
      for (const row of famA.docs.weatherCache ?? []) expect(strings.has(row._id)).toBe(false);
    });

    // ---------- G4b (docs/gates/G4b.md invariants 2, 5, 9) ----------

    test('G4b priceWatches: the gift’s recipient and their sibling can’t read the seeded watch; the adults can', async () => {
      const watch = famA.docs.priceWatches![0] as unknown as { _id: Id<'priceWatches'>; forMemberId: string };
      expect(watch.forMemberId, 'fixture sanity: the seeded watch is for Twin 1').toBe(famA.members.twin1);
      for (const k of ['twin1', 'twin2'] as const) {
        expect(codeOf(await A(k).query(api.shopping.watch, { watchId: watch._id }).catch((e) => e)), k).toBe('NOT_FOUND');
        expect(codeOf(await A(k).query(api.shopping.watches, {}).catch((e) => e)), k).toBe('FORBIDDEN');
      }
      // (`watch`, any status: the grid above already probed `unwatch`, which may have stopped it.)
      for (const k of ['admin', 'partner'] as const) expect((await A(k).query(api.shopping.watch, { watchId: watch._id }))._id, k).toBe(watch._id);
    });

    test('G4b routineSkips: kids can neither read nor answer a holiday question', async () => {
      const skip = famA.docs.routineSkips![0] as unknown as { _id: Id<'routineSkips'> };
      for (const k of ['twin1', 'twin2'] as const) {
        expect(codeOf(await A(k).query(api.holidays.question, { skipId: skip._id }).catch((e) => e)), k).toBe('FORBIDDEN');
        expect(codeOf(await A(k).mutation(api.holidays.answer, { skipId: skip._id, action: 'pause' }).catch((e) => e)), k).toBe('FORBIDDEN');
      }
      expect((await A('partner').query(api.holidays.question, { skipId: skip._id }))._id).toBe(skip._id);
    });

    test('G4b shopping.products: FORBIDDEN for kids', async () => {
      for (const k of ['twin1', 'twin2'] as const) {
        expect(codeOf(await A(k).action(api.shopping.products, { refs: [{ productId: 'gid://shopify/p/x' }] }).catch((e) => e)), k).toBe('FORBIDDEN');
      }
    });

    test('memories.list returns the admin -> partner shared memory to partner (the grantee)', async () => {
      const sharedMemory = (famA.docs.memories as unknown as { scope: string; text: string }[]).find((m) => m.scope === 'shared');
      expect(sharedMemory).toBeDefined();

      const partnerTexts = await memoryTextsFor('sample:partner');
      expect(partnerTexts, 'partner is the grantee of the admin -> partner share').toContain(sharedMemory!.text);
    });
  });
});
