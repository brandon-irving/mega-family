// Family calendar (PLAN §4; GD boards Calendar / CalPartner / CalAfter): a week strip with each day's
// colored dots, the two layer toggles (Household, Only you), Hub's clash banner, and the day's agenda.
// Household events have a solid bar in their person's color; the viewer's private events have a dashed bar,
// a lock and "Only you" — the server only ever returns a private event to its owner (CONTRACT v0.13
// visibility), so a private event here is always the viewer's own. Which layer an event is on comes from
// its stored scope via config (LAYER_OF_SCOPE), never guessed.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { eventDoc, UpcomingHoliday } from '@shared/domain/api';
import { LAYER_OF_SCOPE } from '@shared/config/calendar';
import { FAMILY_MEGA_DEFAULTS } from '@shared/config/looks';
import { CALENDAR_COPY, G4B_UI_COPY, fillCopy } from '@shared/config/copy';
import { readableOn } from '@shared/config/theme';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { LockGlyph } from '@/ui/ThreadCard';
import { hiddenFromA11y } from '@/ui/a11y';
import { Glyph } from '@/features/integrations/glyphs';

export type EventDoc = Infer<typeof eventDoc>;
export type CalendarMember = { _id: string; name: string; hex: string };
/** An open clash proposal, as far as the calendar needs it: which event its fix changes, and where its card is. */
/** An open clash: both household events in it (`clashEventIds`, v0.13a) are tagged CLASH. */
export type CalendarClash = { eventIds: string[]; line: string; messageId?: string };

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
  /** Opens a focused detail view; editing the place is a separate, permitted action there. */
  onOpenEvent?: (event: EventDoc) => void;
  /** G4: saved place labels by id, so an event with a `placeId` shows its place's name. */
  placeLabels?: Record<string, string>;
  /** G4b (board HolidayCalendar): public holidays (`holidays.upcoming`), marked on their day with a gold
   * diamond and a banner saying whether the family paused routines. Board gap: the board also lists the paused
   * morning routine and chores as struck-through PAUSED rows, but routines and chores aren't calendar events
   * (CONTRACT §2), so the banner carries that instead. */
  holidays?: UpcomingHoliday[];
  /** G4b UX review: page to the previous / next week (no board draws a week control; it follows the day strip's
   * style). Without them the strip shows only `weekStart`'s week, as before. */
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  /** Back to the family's current week, for the Today button when the week shown isn't this one. */
  onThisWeek?: () => void;
};

/** Local midnight `n` calendar days after `ms`. DST-safe: a day isn't always 24 hours (Nov 1, 2026 is 25). */
export function addLocalDays(ms: number, n: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
/** The local Sunday midnight that starts the week holding `ms`. */
export function startOfLocalWeek(ms: number): number {
  return addLocalDays(ms, -new Date(ms).getDay());
}
/** "YYYY-MM-DD" for a day start in the device's local time (the week strip's own days). */
const dateKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function eventLayer(e: Pick<EventDoc, 'scope'>) {
  return LAYER_OF_SCOPE[e.scope];
}

export function CalendarContent({ weekStart, todayIndex = null, events, members, viewerId, hubName = FAMILY_MEGA_DEFAULTS.name, clash, onSeeClash, onOpenEvent, placeLabels, holidays = [], onPrevWeek, onNextWeek, onThisWeek }: CalendarContentProps) {
  const tokens = useTokens();
  // Today's day in this week; on another week, its first holiday (so paging to it shows the banner), else Sunday.
  const [selectedDay, setSelectedDay] = useState(() => todayIndex ?? Math.max(0, Array.from({ length: 7 }, (_, i) => dateKey(addLocalDays(weekStart, i))).findIndex((k) => holidays.some((h) => h.date === k))));
  const [showHousehold, setShowHousehold] = useState(true);
  const [showMine, setShowMine] = useState(true);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addLocalDays(weekStart, i)), [weekStart]);
  const colorFor = (memberId: string | undefined) => members.find((m) => m._id === memberId)?.hex ?? tokens.muted;
  const nameFor = (memberId: string | undefined) => (memberId && memberId === viewerId ? CALENDAR_COPY.you : (members.find((m) => m._id === memberId)?.name ?? ''));
  // G2 contrast fix: the selected day's background is tokens.text here (the board's white pill).
  const onSelected = readableOn(tokens.text);

  const visible = events.filter((e) => (eventLayer(e) === 'private' ? showMine : showHousehold));
  const onDay = (i: number) => visible.filter((e) => e.start >= days[i] && e.start < addLocalDays(days[i], 1)).sort((a, b) => a.start - b.start);
  const dayEvents = onDay(selectedDay);
  const holidayOn = (i: number) => holidays.find((h) => h.date === dateKey(days[i]));
  const selectedHoliday = holidayOn(selectedDay);
  const weekHasHoliday = days.some((_, i) => !!holidayOn(i));
  const ownerOf = (e: EventDoc) => (eventLayer(e) === 'private' ? (e.ownerId ?? e.createdBy) : e.who[0]);

  return (
    <>
      {(onPrevWeek || onNextWeek || todayIndex !== null || onThisWeek) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
          {onPrevWeek ? <WeekStep dir="prev" onPress={onPrevWeek} /> : null}
          {onPrevWeek || onNextWeek ? (
            <Text variant="label" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
              {weekRange(days[0], days[6])}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {onNextWeek ? <WeekStep dir="next" onPress={onNextWeek} /> : null}
          {todayIndex !== null || onThisWeek ? (
            <Pressable
              onPress={() => (todayIndex !== null ? setSelectedDay(todayIndex) : onThisWeek?.())}
              accessibilityRole="button"
              hitSlop={tokens.hitSlop}
              style={{ height: 36, paddingHorizontal: tokens.spacing.md, borderRadius: 18, borderWidth: 1, borderColor: tokens.line, justifyContent: 'center', flexShrink: 0 }}
            >
              <Text variant="caption" weight="600">
                {CALENDAR_COPY.today}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {days.map((d, i) => {
          const on = i === selectedDay;
          const dots = [...new Set(onDay(i).map((e) => colorFor(ownerOf(e))))].slice(0, 3);
          const holiday = holidayOn(i);
          const dayName = new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
          return (
            <Pressable
              key={d}
              onPress={() => setSelectedDay(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={holiday ? fillCopy(G4B_UI_COPY.holidayDayLabel, { day: dayName, name: holiday.name }) : dayName}
              style={{
                flex: 1,
                height: 70,
                borderRadius: tokens.radii.md,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                backgroundColor: on ? tokens.text : 'transparent',
                borderWidth: holiday && !on ? 1 : 0,
                borderColor: tokens.warn,
              }}
            >
              <Text variant="caption" weight="600" style={{ color: on ? onSelected : tokens.muted }}>
                {new Date(d).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3)}
              </Text>
              <Text variant="title" style={on ? { color: onSelected } : undefined}>
                {new Date(d).getDate()}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 8 }}>
                {holiday ? <Diamond size={7} testID="holiday-diamond" /> : null}
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
      {selectedHoliday ? <HolidayBanner holiday={selectedHoliday} /> : null}
      {dayEvents.length === 0 ? (
        <Text color="muted">{CALENDAR_COPY.nothingPlanned}</Text>
      ) : (
        <View>
          {dayEvents.map((e) => {
            const priv = eventLayer(e) === 'private';
            const color = colorFor(ownerOf(e));
            const who = priv ? CALENDAR_COPY.you : e.who.map(nameFor).filter(Boolean).join(', ');
            const isClash = !!clash && clash.eventIds.includes(e._id);
            const where = (e.placeId && placeLabels?.[e.placeId]) || e.place;
            const Row = onOpenEvent ? Pressable : View;
            return (
              <Row
                key={e._id}
                {...(onOpenEvent ? { onPress: () => onOpenEvent(e), accessibilityRole: 'button' as const, accessibilityLabel: where ? `${e.title}, ${where}` : e.title } : {})}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 62, borderBottomWidth: 1, borderBottomColor: tokens.line, paddingVertical: tokens.spacing.sm }}
              >
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
                  {...hiddenFromA11y()}
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
                      {where ? ` · ${where}` : ''}
                    </Text>
                  </View>
                </View>
              </Row>
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
      {weekHasHoliday ? (
        <Text variant="caption" color="muted">
          {G4B_UI_COPY.holidayNote}
        </Text>
      ) : null}
    </>
  );
}

/** The board's gold holiday diamond (a rotated square, decorative). */
function Diamond({ size, testID }: { size: number; testID?: string }) {
  const tokens = useTokens();
  return <View testID={testID} {...hiddenFromA11y()} style={{ width: size, height: size, backgroundColor: tokens.warn, transform: [{ rotate: '45deg' }] }} />;
}

/** Board HolidayCalendar: "{name} · public holiday" and what the family decided for routines that day. */
function HolidayBanner({ holiday }: { holiday: UpcomingHoliday }) {
  const tokens = useTokens();
  const line = holiday.skip?.status === 'paused' ? G4B_UI_COPY.holidayBannerPaused : holiday.skip?.status === 'kept' ? G4B_UI_COPY.holidayBannerKept : null;
  return (
    <View testID="holiday-banner" accessible style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, padding: tokens.spacing.md, borderRadius: tokens.radii.lg, backgroundColor: tokens.warnSurface, borderWidth: 1, borderColor: tokens.warn }}>
      <View style={{ marginHorizontal: 4 }}>
        <Diamond size={12} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="label">{fillCopy(G4B_UI_COPY.holidayBanner, { name: holiday.name })}</Text>
        {line ? (
          <Text variant="caption" color="muted">
            {line}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** "Oct 25 – 31", or "Nov 29 – Dec 5" across two months. */
function weekRange(first: number, last: number): string {
  const a = new Date(first);
  const b = new Date(last);
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  return a.getMonth() === b.getMonth() ? `${month(a)} ${a.getDate()} – ${b.getDate()}` : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`;
}

/** The week pager's round 36pt step (the Today pill's outline), its chevron pointing the way it goes. */
function WeekStep({ dir, onPress }: { dir: 'prev' | 'next'; onPress: () => void }) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={dir === 'prev' ? G4B_UI_COPY.weekPrev : G4B_UI_COPY.weekNext}
      hitSlop={tokens.hitSlop}
      style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: tokens.line, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
    >
      <View style={dir === 'prev' ? { transform: [{ rotate: '180deg' }] } : undefined}>
        <Glyph name="chevron" color={tokens.text} size={16} stroke={2.2} />
      </View>
    </Pressable>
  );
}

function LayerToggle({ label, on, onPress, kind }: { label: string; on: boolean; onPress: () => void; kind: 'household' | 'private' }) {
  const tokens = useTokens();
  const household = kind === 'household';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      // `aria-checked` is what react-native-web puts on the page; accessibilityState is what native reads.
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={label}
      // On: filled, solid border, filled dot. Off: see-through, dashed border, hollow dot, muted words.
      style={{
        height: 40,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: on ? 1 : 1.5,
        borderStyle: on ? 'solid' : 'dashed',
        borderColor: on ? (household ? tokens.householdLine : tokens.muted) : tokens.line,
        backgroundColor: on ? (household ? tokens.householdSurface : tokens.surface) : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {household ? (
        <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: tokens.household, backgroundColor: on ? tokens.household : 'transparent' }} />
      ) : (
        <LockGlyph color={on ? tokens.text : tokens.muted} size={14} />
      )}
      <Text variant="label" color={on ? undefined : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}
