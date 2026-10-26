// CONTRACT §4 `calendar.range`.
import { API } from '../shared/domain/api';
import { query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { eventsInRange } from './model/home';
import { requireViewer } from './model/viewer';

/** A year is a generous ceiling for a single calendar screen's range; it stops a pathological `to` from
 * forcing an unbounded scan (CLAUDE.md → "every client-controlled range needs an upper bound too"). */
const MAX_RANGE_MS = 366 * 24 * 60 * 60_000;

export const range = query({
  ...pick(API.calendar.range),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (!Number.isFinite(args.from) || !Number.isFinite(args.to) || args.to < args.from) fail('VALIDATION', 'bad range');
    if (args.to - args.from > MAX_RANGE_MS) fail('VALIDATION', 'range too large');
    return eventsInRange(ctx, viewer, args.from, args.to);
  },
});
