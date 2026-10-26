// Milestone A helper (see worktree task brief): every public function spreads its entry from
// `shared/domain/api.ts` so its args/returns can never drift from the contract. `API.mod.fn` also carries
// `kind`/`day1`/`adminOnly` bookkeeping that Convex's `query`/`mutation`/`action` builders don't accept as
// object-literal keys; `pick` strips that bookkeeping down to exactly `{ args, returns }`.
export function pick<A extends Record<string, unknown>, R>(f: { args: A; returns: R }): { args: A; returns: R } {
  return { args: f.args, returns: f.returns };
}
