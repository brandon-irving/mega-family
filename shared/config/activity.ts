// v0.17b (G5 frontend ask): Profile → Activity's "who decided" chip. `megas.activity` uses the event's own
// `payload.decidedBy` when it recorded one; otherwise this default for its type (a familyEvents type). `member`
// = a person's own action; the server sends `member:<id>` when the event's `payload.actorId` is a member of the
// family ("You" / their name in the app) and a bare `member` when it can't say who ("A family member"), never a
// guess. `rule:` = a fixed rule; `model:` = MEGA (AI). Owned by the backend, read by both.
const MEMBER = 'member';

export const ACTIVITY = {
  member: MEMBER,
  decidedByDefault: {
    said: MEMBER,
    'calendar.changed': MEMBER,
    'list.changed': MEMBER,
    'notification.answered': MEMBER,
    'reminder.due': 'rule:reminder',
    'weather.alert': 'rule:weatherAlert',
    'clock.tick': 'rule:clock',
    'job.changed': 'rule:job',
  } as Readonly<Record<string, string>>,
} as const;
