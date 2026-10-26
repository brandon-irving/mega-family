// Registers the two Convex components this backend uses. PLAN.md → Backend decided a thin hand-rolled
// agent loop over `@convex-dev/agent` (we already own scopes/memory), but streaming and sign-in are
// better left to components than hand-rolled.
import { defineApp } from 'convex/server';
import betterAuth from '@convex-dev/better-auth/convex.config';
import persistentTextStreaming from '@convex-dev/persistent-text-streaming/convex.config';

const app = defineApp();
app.use(betterAuth);
app.use(persistentTextStreaming);
export default app;
