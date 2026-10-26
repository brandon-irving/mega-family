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
    const a = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
    const b = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });

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
  });
});
