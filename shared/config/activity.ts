// v0.17b (G5 frontend ask): Profile → Activity's "who decided" chip. `megas.activity` uses the event's own
// `payload.decidedBy` when it recorded one; otherwise this default for its type (a familyEvents type). `member` =
// a person's own action ("You" / their name); `rule:` = a fixed rule; `model:` = MEGA (AI). Owned by the backend,
// read by both.
export const ACTIVITY = {
  decidedByDefault: {
    said: 'member',
    'calendar.changed': 'member',
    'list.changed': 'member',
    'notification.answered': 'member',
    'reminder.due': 'rule:reminder',
    'weather.alert': 'rule:weatherAlert',
    'clock.tick': 'rule:clock',
    'job.changed': 'rule:job',
  } as Readonly<Record<string, string>>,
} as const;
