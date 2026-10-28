// Family calendar (PLAN §4; GD boards Calendar / CalPartner / CalAfter): a week strip with each day's
// colored dots, the two layer toggles (Household, Only you), Hub's clash banner, and the day's agenda.
// Household events have a solid bar in their person's color; the viewer's private events have a dashed bar,
// a lock and "Only you" — the server only ever returns a private event to its owner (CONTRACT v0.13
// visibility), so a private event here is always the viewer's own. Which layer an event is on comes from
// its stored scope via config (LAYER_OF_SCOPE), never guessed.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { eventDoc } from '@shared/domain/api';
import { LAYER_OF_SCOPE } from '@shared/config/calendar';
import { FAMILY_MEGA_DEFAULTS } from '@shared/config/looks';
import { CALENDAR_COPY, fillCopy } from '@shared/config/copy';
import { readableOn } from '@shared/config/theme';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { LockGlyph } from '@/ui/ThreadCard';

export type EventDoc = Infer<typeof eventDoc>;
export type CalendarMember = { _id: string; name: string; hex: string };
/** An open clash proposal, as far as the calendar needs it: which event its fix changes, and where its card is. */
export type CalendarClash = { eventId: string; line: string; messageId?: string };

export type CalendarContentProps = {
  weekStart: number;
  /** Index of today within the week (for the Today button), or null when the week shown isn't this one. */
  todayIndex?: number | null;
  events: EventDoc[];
  members: CalendarMember[];
  viewerId?: string;
  hubName?: string;
  clash?: CalendarClash | null;
  onSeeClash?: (clash: CalendarClash) => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function eventLayer(e: Pick<EventDoc, 'scope'>) {
  return LAYER_OF_SCOPE[e.scope];
}

export function CalendarContent({ weekStart, todayIndex = null, events, members, viewerId, hubName = FAMILY_MEGA_DEFAULTS.name, clash, onSeeClash }: CalendarContentProps) {
  const tokens = useTokens();
  const [selectedDay, setSelectedDay] = useState(todayIndex ?? 0);
  const [showHousehold, setShowHousehold] = useState(true);
  const [showMine, setShowMine] = useState(true);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart + i * DAY_MS), [weekStart]);
  const colorFor = (memberId: string | undefined) => members.find((m) => m._id === memberId)?.hex ?? tokens.muted;
  const nameFor = (memberId: string | undefined) => (memberId && memberId === viewerId ? CALENDAR_COPY.you : (members.find((m) => m._id === memberId)?.name ?? ''));
  // G2 contrast fix: the selected day's background is tokens.text here (the board's white pill).
  const onSelected = readableOn(tokens.text);

  const visible = events.filter((e) => (eventLayer(e) === 'private' ? showMine : showHousehold));
  const onDay = (i: number) => visible.filter((e) => e.start >= days[i] && e.start < days[i] + DAY_MS).sort((a, b) => a.start - b.start);
  const dayEvents = onDay(selectedDay);
  const ownerOf = (e: EventDoc) => (eventLayer(e) === 'private' ? (e.ownerId ?? e.createdBy) : e.who[0]);

  return (
    <>
      {todayIndex !== null && (
        <Pressable onPress={() => setSelectedDay(todayIndex)} accessibilityRole="button" style={{ alignSelf: 'flex-end', height: 36, paddingHorizontal: tokens.spacing.md, borderRadius: 18, borderWidth: 1, borderColor: tokens.line, justifyContent: 'center' }}>
          <Text variant="caption" weight="600">
            {CALENDAR_COPY.today}
          </Text>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {days.map((d, i) => {
          const on = i === selectedDay;
          const dots = [...new Set(onDay(i).map((e) => colorFor(ownerOf(e))))].slice(0, 3);
          return (
            <Pressable
              key={d}
              onPress={() => setSelectedDay(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              style={{ flex: 1, height: 70, borderRadius: tokens.radii.md, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: on ? tokens.text : 'transparent' }}
            >
              <Text variant="caption" weight="600" style={{ color: on ? onSelected : tokens.muted }}>
                {new Date(d).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3)}
              </Text>
              <Text variant="title" style={on ? { color: onSelected } : undefined}>
                {new Date(d).getDate()}
              </Text>
              <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
                {dots.map((c) => (
                  <View key={c} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, paddingBottom: tokens.spacing.md, borderBottomWidth: 1, borderBottomColor: tokens.line }}>
        <LayerToggle label={CALENDAR_COPY.household} on={showHousehold} onPress={() => setShowHousehold((v) => !v)} kind="household" />
        <LayerToggle label={CALENDAR_COPY.onlyYou} on={showMine} onPress={() => setShowMine((v) => !v)} kind="private" />
      </View>

      {clash && showHousehold && (
        <Pressable
          onPress={() => onSeeClash?.(clash)}
          accessibilityRole="button"
          accessibilityLabel={`${fillCopy(CALENDAR_COPY.clashBanner, { hub: hubName })}. ${clash.line}. ${CALENDAR_COPY.seeFix}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, padding: tokens.spacing.md, borderRadius: tokens.radii.lg, backgroundColor: tokens.householdSurface, borderWidth: 1, borderColor: tokens.householdLine }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">{fillCopy(CALENDAR_COPY.clashBanner, { hub: hubName })}</Text>
            <Text variant="caption" style={{ color: tokens.householdText }}>
              {clash.line}
            </Text>
          </View>
          <Text variant="label" style={{ color: tokens.household }}>
            {CALENDAR_COPY.seeFix}
          </Text>
        </Pressable>
      )}

      <Text variant="label">{new Date(days[selectedDay]).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
      {dayEvents.length === 0 ? (
        <Text color="muted">{CALENDAR_COPY.nothingPlanned}</Text>
      ) : (
        <View>
          {dayEvents.map((e) => {
            const priv = eventLayer(e) === 'private';
            const color = colorFor(ownerOf(e));
            const who = priv ? CALENDAR_COPY.you : e.who.map(nameFor).filter(Boolean).join(', ');
            const isClash = !!clash && clash.eventId === e._id;
            return (
              <View key={e._id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 62, borderBottomWidth: 1, borderBottomColor: tokens.line, paddingVertical: tokens.spacing.sm }}>
                <View style={{ width: 74 }}>
                  <Text variant="caption" color="muted">
                    {e.allDay ? CALENDAR_COPY.allDay : clock(e.start)}
                  </Text>
                  {e.end && !e.allDay ? (
                    <Text variant="caption" color="muted" style={{ opacity: 0.7 }}>
                      {fillCopy(CALENDAR_COPY.until, { time: clock(e.end) })}
                    </Text>
                  ) : null}
                </View>
                <View
                  accessibilityElementsHidden
                  style={{ width: 4, height: 38, borderRadius: 2, backgroundColor: priv ? 'transparent' : color, borderWidth: priv ? 2 : 0, borderStyle: priv ? 'dashed' : 'solid', borderColor: color }}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
                    <Text variant="label" style={{ flexShrink: 1 }}>
                      {e.title}
                    </Text>
                    {isClash && (
                      <View style={{ paddingHorizontal: 7, borderRadius: tokens.radii.sm, backgroundColor: tokens.warnSurface }}>
                        <Text variant="caption" weight="700" style={{ color: tokens.warn }}>
                          {CALENDAR_COPY.clashTag}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    {priv && <LockGlyph color={tokens.muted} />}
                    <Text variant="caption" color="muted">
                      {fillCopy(priv ? CALENDAR_COPY.whoPrivate : eventLayer(e) === 'grant' ? CALENDAR_COPY.whoShared : CALENDAR_COPY.whoHousehold, { who })}
                      {e.place ? ` · ${e.place}` : ''}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md }}>
        {members.map((m) => (
          <View key={m._id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m.hex }} />
            <Text variant="caption" color="muted">
              {nameFor(m._id)}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <LockGlyph color={tokens.muted} />
        <Text variant="caption" color="muted" style={{ flex: 1 }}>
          {fillCopy(CALENDAR_COPY.privateNote, { hub: hubName })}
        </Text>
      </View>
    </>
  );
}

function LayerToggle({ label, on, onPress, kind }: { label: string; on: boolean; onPress: () => void; kind: 'household' | 'private' }) {
  const tokens = useTokens();
  const household = kind === 'household';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{
        height: 40,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: on ? (household ? tokens.householdLine : tokens.muted) : tokens.line,
        backgroundColor: on ? (household ? tokens.householdSurface : tokens.surface) : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: on ? 1 : 0.7,
      }}
    >
      {household ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.household }} /> : <LockGlyph color={tokens.text} size={14} />}
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}
