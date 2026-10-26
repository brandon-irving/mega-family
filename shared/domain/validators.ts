// Small helpers for building validators from `as const` value lists, so each enum is written once
// and gives both a runtime validator and a TypeScript type.
import { type GenericId, v, type Validator, type VLiteral, type VUnion } from 'convex/values';

type LiteralUnion<T extends readonly string[]> = VUnion<T[number], { -readonly [K in keyof T]: VLiteral<T[K], 'required'> }, 'required'>;

/** `literals(['a', 'b'])` → `v.union(v.literal('a'), v.literal('b'))`. */
export function literals<const T extends readonly [string, string, ...string[]]>(values: T): LiteralUnion<T> {
  return v.union(...(values.map((x) => v.literal(x)) as never)) as unknown as LiteralUnion<T>;
}

/** Adds the system fields Convex puts on every document, for use in `returns` validators. */
export function withSystemFields<Table extends string, Fields extends Record<string, Validator<unknown, 'required' | 'optional', string>>>(
  table: Table,
  fields: Fields,
) {
  return v.object({ ...fields, _id: v.id(table), _creationTime: v.number() });
}

export type Id<Table extends string> = GenericId<Table>;
