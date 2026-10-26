// Typed Convex function references built straight from shared/domain/api.ts — the contract, not the
// backend. The backend exports `function <fn>` from `convex/<module>.ts`, so the path is "<module>:<fn>".
// Components never import convex/_generated; they go through the small hooks in src/data/ instead.
import { type FunctionReference, makeFunctionReference } from 'convex/server';
import type { ObjectType, PropertyValidators, Validator } from 'convex/values';
import { API } from '@shared/domain/api';

type Fn = { kind: 'query' | 'mutation' | 'action'; args: PropertyValidators; returns: Validator<any, any, any> };

/** The function reference type for one contract entry. */
type RefOf<F extends Fn> = FunctionReference<F['kind'], 'public', ObjectType<F['args']>, F['returns'] extends Validator<infer R, any, any> ? R : never>;

/** Mirrors the shape of `API`, replacing each `fn({...})` spec with its typed FunctionReference. */
export type ApiRefs<M> = { [K in keyof M]: M[K] extends Fn ? RefOf<M[K]> : never };

function buildModule<M extends Record<string, Fn>>(moduleName: string, mod: M): ApiRefs<M> {
  const out: Record<string, unknown> = {};
  for (const fnName of Object.keys(mod)) out[fnName] = makeFunctionReference(`${moduleName}:${fnName}`);
  return out as ApiRefs<M>;
}

type ApiModules = typeof API;
export type Api = { [M in keyof ApiModules]: ApiRefs<ApiModules[M]> };

/** `api.chat.thread`, `api.today.get`, … — typed exactly like the contract, built without codegen. */
export const api: Api = Object.fromEntries(Object.entries(API).map(([moduleName, mod]) => [moduleName, buildModule(moduleName, mod as Record<string, Fn>)])) as Api;
