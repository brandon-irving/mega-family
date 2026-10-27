// Registers the production proactive-engine sweep (PLAN.md -> Proactive engine). The demo's simulated
// clock (`clock.jump`) drives the exact same per-family tick synchronously instead of waiting for this
// interval — see `convex/model/proactive.ts` `tickFamilyLogic` and `convex/clock.ts`.
import { cronJobs } from 'convex/server';
import { PROACTIVE } from '../shared/config';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval('proactive engine sweep', { minutes: PROACTIVE.sweepIntervalMinutes }, internal.proactive.tickAllFamilies, {});

export default crons;
