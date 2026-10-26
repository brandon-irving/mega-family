// CONTRACT §4 `widgets.timeline` + §6 WidgetEntry. The rule ("events in the next 2 hours first, otherwise
// the top statement") runs here, on the server; the app only renders the entries it's given.
import { PERSONALITIES } from '../shared/config';
import { API, LINKS } from '../shared/domain/api';
import { query } from './_generated/server';
import { pick } from './model/define';
import { topStatementCandidate, upcomingEvents } from './model/home';
import { clock } from './ports/clock';
import { requireViewer } from './model/viewer';

function relativeMinutes(at: number, now: number): string {
  const min = Math.round((at - now) / 60_000);
  if (min <= 0) return 'now';
  if (min < 60) return `in ${min} min`;
  return `in ${Math.round(min / 60)}h`;
}

export const timeline = query({
  ...pick(API.widgets.timeline),
  handler: async (ctx, _args) => {
    const viewer = await requireViewer(ctx);
    const megaInfo = viewer.mega
      ? { name: viewer.mega.name, hex: viewer.mega.look.hex, sticker: viewer.mega.look.sticker, face: PERSONALITIES[viewer.mega.personality].face }
      : { name: 'MEGA', hex: '#9AA1AB', sticker: 'none', face: 'calm' };

    const events = await upcomingEvents(ctx, viewer);
    if (events.length > 0) {
      const now = await clock.now(ctx, viewer.member.familyId);
      const out = [];
      for (const event of events) {
        const who = [];
        for (const memberId of event.who) {
          const member = await ctx.db.get(memberId);
          if (!member) continue;
          const mega = await ctx.db
            .query('megas')
            .withIndex('by_family_owner', (q) => q.eq('familyId', viewer.member.familyId).eq('ownerId', memberId))
            .unique();
          who.push({ name: member.name, hex: mega?.look.hex ?? '#9AA1AB' });
        }
        out.push({
          at: event.start,
          kind: 'event' as const,
          title: event.title,
          subtitle: `${relativeMinutes(event.start, now)}${event.place ? ` · ${event.place}` : ''}`,
          who,
          mega: megaInfo,
          link: LINKS.today(),
        });
      }
      return out;
    }

    const statement = await topStatementCandidate(ctx, viewer);
    if (statement) {
      return [{ at: statement._creationTime, kind: 'statement' as const, title: statement.draft.text, mega: megaInfo, link: LINKS.chat() }];
    }

    return [{ at: await clock.now(ctx, viewer.member.familyId), kind: 'empty' as const, title: 'All clear for now.', mega: megaInfo, link: LINKS.today() }];
  },
});
