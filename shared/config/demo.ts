// Demo flags (CONTRACT §7 `demo`). The actual gate reads the deployment's DEMO_MODE env var at call time
// (convex/clock.ts, convex/auth.ts) — it can't live only here, since this file is bundled into the app too
// and must never let a client decide its own demo mode. This just names the mechanism in one place.
export const DEMO = {
  /** The env var name both `clock.jump` and demo sign-in gate on. Must be exactly `'true'` on the deployment. */
  envVar: 'DEMO_MODE',
} as const;
