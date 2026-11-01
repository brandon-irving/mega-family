// @vitest-environment node
/// <reference types="node" />
// Checks that CONTRACT.md, shared/ and convex/schema.ts still agree. If this fails, either the code drifted
// from the contract or the contract changed without the code (and the changelog) following.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import schema from '../convex/schema';
import { BUTTON_SETS, IDENTITY, NOTIFICATION_KINDS_CONFIG, PERSONALITIES } from '../shared/config';
import { API, LINKS } from '../shared/domain/api';
import * as E from '../shared/domain/enums';
import { TABLES } from '../shared/domain/tables';

const contract = fs.readFileSync(path.join(__dirname, '..', 'CONTRACT.md'), 'utf8');
const section = (start: string, end: string) => contract.slice(contract.indexOf(start), contract.indexOf(end, contract.indexOf(start)));

describe('tables', () => {
  test('the schema has exactly the contract tables', () => {
    expect(Object.keys(schema.tables).sort()).toEqual(Object.keys(TABLES).sort());
  });

  test('every table named in CONTRACT.md §2 exists', () => {
    const named = [...section('## 2. Tables', '## 3.').matchAll(/^\*\*(\w+)\*\*(?: \([^)]*\))?:/gm)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(20);
    expect(named.sort()).toEqual(Object.keys(TABLES).sort());
  });

  test('every family-owned table has familyId', () => {
    for (const [name, fields] of Object.entries(TABLES)) {
      if (name === 'families' || name === 'demoProfiles') continue; // demoProfiles is identity-owned, not family-owned
      expect(fields, name).toHaveProperty('familyId');
    }
  });
});

describe('enums', () => {
  const table = section('## 1. Enums', '## 2.');
  const fromContract = (name: string) => {
    const row = table.split('\n').find((l) => l.startsWith(`| \`${name}\``));
    expect(row, name).toBeDefined();
    return [...row!.split('|')[2].replace(/\([^)]*\)/g, '').matchAll(/`([^`]+)`/g)].map((m) => m[1]); // notes in brackets are not values
  };
  const cases: [string, readonly string[]][] = [
    ['Role', E.ROLES],
    ['Relationship', E.RELATIONSHIPS],
    ['MegaKind', E.MEGA_KINDS],
    ['Personality', E.PERSONALITIES],
    ['Scope', E.SCOPES],
    ['MemoryKind', E.MEMORY_KINDS],
    ['LearningTrigger', E.LEARNING_TRIGGERS],
    ['NotificationKind', E.NOTIFICATION_KINDS],
    ['Delivery', E.DELIVERIES],
    ['Loudness', E.LOUDNESS],
    ['ThemeName', E.THEME_NAMES],
    ['Station', E.STATIONS],
    ['Via', E.VIAS],
    ['Platform', E.PLATFORMS],
    ['Reaction', E.REACTIONS],
  ];
  test.each(cases)('%s matches CONTRACT.md', (name, values) => {
    expect(fromContract(name)).toEqual([...values]);
  });

  test('error codes match CONTRACT.md §9', () => {
    const codes = [...section('## 9. Error codes', '## 10.').matchAll(/`([A-Z_]+)`/g)].map((m) => m[1]);
    expect(codes).toEqual([...E.ERROR_CODES]);
  });
});

describe('API', () => {
  /** Function names from the §4 tables, expanding rows like "`events.create` / `.update` / `.cancel`". */
  function contractFunctions() {
    const names: { name: string; kind: string }[] = [];
    for (const line of section('## 4. Public API', '## 5.').split('\n')) {
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length < 4 || !cells[1].startsWith('`')) continue;
      const parts = [...cells[1].matchAll(/`([\w.]+)`/g)].map((m) => m[1]);
      const module = parts[0].split('.')[0];
      for (const p of parts) names.push({ name: p.startsWith('.') ? module + p : p, kind: cells[2] });
    }
    return names;
  }
  const kinds: Record<string, string> = { q: 'query', m: 'mutation', a: 'action' };

  test('every function in CONTRACT.md §4 is in the API map with the same kind', () => {
    const listed = contractFunctions().filter((f) => f.kind !== 'h'); // HTTP routes aren't Convex functions
    expect(listed.length).toBeGreaterThan(40);
    for (const f of listed) {
      const [mod, name] = f.name.split('.');
      const entry = (API as Record<string, Record<string, { kind: string }>>)[mod]?.[name];
      expect(entry, f.name).toBeDefined();
      expect(entry.kind, f.name).toBe(kinds[f.kind]);
    }
  });

  test('the API map has nothing that CONTRACT.md §4 does not list', () => {
    const listed = new Set(contractFunctions().map((f) => f.name));
    for (const [mod, fns] of Object.entries(API)) for (const name of Object.keys(fns)) expect(listed.has(`${mod}.${name}`), `${mod}.${name}`).toBe(true);
  });

  test('every args field and returns is a Convex validator', () => {
    for (const [mod, fns] of Object.entries(API)) {
      for (const [name, f] of Object.entries(fns as Record<string, { args: Record<string, unknown>; returns: { isConvexValidator?: boolean } }>)) {
        expect(f.returns.isConvexValidator, `${mod}.${name} returns`).toBe(true);
        for (const [arg, val] of Object.entries(f.args)) expect((val as { isConvexValidator?: boolean }).isConvexValidator, `${mod}.${name}(${arg})`).toBe(true);
      }
    }
  });

  test('no function takes the caller as an argument (rule 3)', () => {
    for (const [mod, fns] of Object.entries(API)) {
      for (const [name, f] of Object.entries(fns as Record<string, { args: Record<string, unknown> }>)) {
        expect(Object.keys(f.args), `${mod}.${name}`).not.toContain('familyId');
        expect(Object.keys(f.args), `${mod}.${name}`).not.toContain('viewerId');
      }
    }
  });
});

describe('config consistency', () => {
  test('deep links use the configured scheme and match CONTRACT.md §6', () => {
    const routes = section('## 6. Deep links', '**WidgetEntry').match(/`mega:\/\/[^`]+`/g)!.map((r) => r.slice(1, -1));
    const built = [LINKS.chat(), LINKS.chatMessage('<messageId>'), LINKS.talk(), LINKS.today(), LINKS.familyMember('<memberId>'), LINKS.hq(), LINKS.hq('<memberId>'), LINKS.join('<token>')];
    expect(built.every((l) => l.startsWith(`${IDENTITY.scheme}://`))).toBe(true);
    expect(built.sort()).toEqual(routes.sort());
  });

  test('every notification kind points at a button set that exists', () => {
    for (const k of E.NOTIFICATION_KINDS) expect(BUTTON_SETS).toHaveProperty(NOTIFICATION_KINDS_CONFIG[k].buttons);
  });

  test('button ids are unique within each set', () => {
    for (const [id, set] of Object.entries(BUTTON_SETS)) expect(new Set(set.map((b) => b.id)).size, id).toBe(set.length);
  });

  test('every personality has a face', () => {
    for (const p of E.PERSONALITIES) expect(PERSONALITIES[p].face).toBeTruthy();
  });
});
