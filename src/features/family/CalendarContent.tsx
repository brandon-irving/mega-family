// Family calendar (PLAN §4): week strip + day agenda, color-coded by member.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { eventDoc } from '@shared/domain/api';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export type EventDoc = Infer<typeof eventDoc>;
export type CalendarMember = { _id: string; name: string; hex: string };

export type CalendarContentProps = { weekStart: number; events: EventDoc[]; members: CalendarMember[] };

const DAY_MS = 24 * 60 * 60 * 1000;

export function CalendarContent({ weekStart, events, members }: CalendarContentProps) {
  const tokens = useTokens();
  const [selectedDay, setSelectedDay] = useState(0);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart + i * DAY_MS), [weekStart]);
  const colorFor = (memberId: string) => members.find((m) => m._id === memberId)?.hex ?? tokens.muted;

  const dayEvents = events
    .filter((e) => e.start >= days[selectedDay] && e.start < days[selectedDay] + DAY_MS)
    .sort((a, b) => a.start - b.start);

  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: tokens.spacing.lg }}>
        {days.map((d, i) => (
          <Pressable
            key={d}
            onPress={() => setSelectedDay(i)}
            accessibilityRole="button"
            accessibilityLabel={new Date(d).toLocaleDateString(undefined, { weekday: 'long' })}
            style={{
              width: 40,
              height: 52,
              borderRadius: tokens.radii.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: i === selectedDay ? tokens.accent : 'transparent',
            }}
          >
            <Text variant="caption" style={i === selectedDay ? { color: tokens.onAccent } : undefined}>
              {new Date(d).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}
            </Text>
            <Text variant="label" style={i === selectedDay ? { color: tokens.onAccent } : undefined}>
              {new Date(d).getDate()}
            </Text>
          </Pressable>
        ))}
      </View>

      {dayEvents.length === 0 ? (
        <Text color="muted">No events this day.</Text>
      ) : (
        <View style={{ gap: tokens.spacing.sm }}>
          {dayEvents.map((e) => (
            <Card key={e._id} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
              <View style={{ flexDirection: 'row', marginRight: tokens.spacing.xs }}>
                {e.who.map((who) => (
                  <View key={who} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colorFor(who), marginRight: -4 }} />
                ))}
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label">{e.title}</Text>
                <Text variant="caption" color="muted">
                  {e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  {e.place ? ` · ${e.place}` : ''}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}
    </>
  );
}
