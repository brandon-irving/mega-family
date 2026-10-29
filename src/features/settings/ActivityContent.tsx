// Profile → Activity (canvas Screen 16, board ProfileActivity; admin, since `megas.activity` is admin only):
// one-line filter chips (All · Calendar · Reminders · Learned · Accounts), the family's MEGA activity grouped by
// day with its time, then "What {mega} learned" — the newest memories, each with Forget (then "Forgotten…") —
// and a link to everything it remembers. Each row shows the board's "who decided" chip (Rule · MEGA (AI) · You)
// and its short reason when the item carries `decidedBy` / `why` (CONTRACT v0.17b, pending on the backend);
// an item without them shows no chip, never a guess. Never empty: with nothing yet, a line says what will show
// up here.
import { View } from 'react-native';
import type { Infer } from 'convex/values';
import type { activityItem, memoryDoc } from '@shared/domain/api';
import { G5_FIX_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { GlyphName } from '@/features/integrations/glyphs';
import { IconTile } from '@/features/accounts/parts';
import { ChipLine, LinkRow, SettingsSection } from './rows';

/** A row; `decidedBy` is CONTRACT v0.17b (`rule:<id>` | `model:<id>` | `member`). `why` (a short reason) isn't
 * in the contract yet; the chip shows it when present. */
export type ActivityItem = Infer<typeof activityItem> & { why?: string };

type Decided = 'rule' | 'ai' | 'you';
function decidedKind(decidedBy: string | undefined): Decided | null {
  if (!decidedBy) return null;
  if (decidedBy.startsWith('rule:')) return 'rule';
  if (decidedBy.startsWith('model:')) return 'ai';
  return 'you';
}

/** The chip's word for who decided, or null when the item doesn't say. */
export function decidedLabel(decidedBy: string | undefined): string | null {
  const k = decidedKind(decidedBy);
  return k === 'rule' ? G5_FIX_COPY.decidedRule : k === 'ai' ? G5_FIX_COPY.decidedAi : k === 'you' ? G5_FIX_COPY.decidedYou : null;
}
export type MemoryDoc = Infer<typeof memoryDoc>;
export type ActivityFilter = 'all' | 'calendar' | 'reminders' | 'learned' | 'accounts';

/** Which filter a family event type belongs to; `null` = background bookkeeping, never listed. */
export function filterOf(type: string): Exclude<ActivityFilter, 'all' | 'learned'> | 'other' | null {
  if (type === 'clock.tick' || type === 'job.changed') return null;
  if (type.startsWith('calendar.')) return 'calendar';
  if (type.startsWith('reminder.') || type.startsWith('notification.') || type.startsWith('weather.') || type.startsWith('list.')) return 'reminders';
  if (type.startsWith('integration.') || type.startsWith('mail.')) return 'accounts';
  return 'other';
}

const GLYPH: Record<string, GlyphName> = { calendar: 'calendar', reminders: 'bell', accounts: 'link', other: 'info' };

/** "Today", "Yesterday" or "Mon, Oct 26" for `at`, in the family's timezone, relative to the family clock. */
export function dayLabel(at: number, now: number, timeZone: string): string {
  const key = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone });
  if (key(at) === key(now)) return U.today;
  if (key(at) === key(now - 24 * 60 * 60 * 1000)) return U.yesterday;
  return new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone });
}

export function ActivityContent({
  items,
  memories,
  forgotten,
  filter,
  onFilter,
  megaName,
  now,
  timeZone,
  canLoadMore,
  onLoadMore,
  onForget,
  onOpenMemories,
}: {
  items: ActivityItem[];
  memories: MemoryDoc[];
  forgotten: string[];
  filter: ActivityFilter;
  onFilter: (f: ActivityFilter) => void;
  megaName: string;
  now: number;
  timeZone: string;
  canLoadMore: boolean;
  onLoadMore: () => void;
  onForget: (memoryId: MemoryDoc['_id']) => void;
  onOpenMemories: () => void;
}) {
  const tokens = useTokens();
  const filters: { id: ActivityFilter; label: string }[] = [
    { id: 'all', label: U.filterAll },
    { id: 'calendar', label: U.filterCalendar },
    { id: 'reminders', label: U.filterReminders },
    { id: 'learned', label: U.filterLearned },
    { id: 'accounts', label: U.filterAccounts },
  ];
  const shown = filter === 'learned' ? [] : items.filter((i) => {
    const f = filterOf(i.type);
    return f !== null && (filter === 'all' || f === filter);
  });
  const days: { label: string; rows: ActivityItem[] }[] = [];
  for (const item of shown) {
    const label = dayLabel(item.at, now, timeZone);
    const last = days.at(-1);
    if (last?.label === label) last.rows.push(item);
    else days.push({ label, rows: [item] });
  }
  const time = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
  const showLearned = filter === 'all' || filter === 'learned';

  return (
    <View style={{ gap: tokens.spacing.xl }} testID="activity-content">
      <ChipLine chips={filters} selected={filter} onPress={(id) => onFilter(id as ActivityFilter)} />
      {days.map((d) => (
        <SettingsSection key={d.label} title={d.label}>
          {d.rows.map((r, i) => {
            const f = filterOf(r.type) ?? 'other';
            return (
              <View key={`${r.at}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, padding: tokens.spacing.lg }}>
                <IconTile icon={GLYPH[f]} tone={f === 'calendar' ? 'household' : f === 'accounts' ? 'accent' : 'muted'} size={36} />
                <View style={{ flex: 1, gap: tokens.spacing.xs }}>
                  <Text>{r.summary}</Text>
                  <DecidedChip decidedBy={r.decidedBy} why={r.why} />
                </View>
                <Text variant="caption" color="muted">
                  {time(r.at)}
                </Text>
              </View>
            );
          })}
        </SettingsSection>
      ))}
      {!showLearned && days.length === 0 ? <Text color="muted">{fillCopy(U.activityQuiet, { mega: megaName })}</Text> : null}
      {canLoadMore && filter !== 'learned' ? <Button label={U.showMore} variant="secondary" onPress={onLoadMore} style={{ alignSelf: 'stretch' }} /> : null}
      {showLearned ? (
        <SettingsSection title={fillCopy(U.learnedTitle, { mega: megaName })} note={fillCopy(U.learnedFoot, { mega: megaName })}>
          {memories.length === 0 ? (
            <Text color="muted" style={{ padding: tokens.spacing.lg }}>
              {fillCopy(U.learnedQuiet, { mega: megaName })}
            </Text>
          ) : null}
          {memories.map((m) => {
            const gone = forgotten.includes(m._id);
            return (
              <View key={m._id} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, padding: tokens.spacing.lg }}>
                <IconTile icon="brain" tone={gone ? 'muted' : 'accent'} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={gone ? { color: tokens.muted } : undefined}>{m.text}</Text>
                  {gone ? (
                    <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
                      {fillCopy(U.forgotten, { mega: megaName })}
                    </Text>
                  ) : null}
                </View>
                {gone ? null : <Button label={U.forget} accessibilityLabel={fillCopy(U.forgetLabel, { label: m.text })} variant="secondary" pill onPress={() => onForget(m._id)} />}
              </View>
            );
          })}
          <LinkRow label={fillCopy(U.everything, { mega: megaName })} hint={U.everythingHint} onPress={onOpenMemories} />
        </SettingsSection>
      ) : null}
    </View>
  );
}

/** "Rule" (grey) · "MEGA (AI)" (accent) · "You" (gold), then the reason, on one line (board ProfileActivity). */
function DecidedChip({ decidedBy, why }: { decidedBy?: string; why?: string }) {
  const tokens = useTokens();
  const kind = decidedKind(decidedBy);
  if (!kind) return null;
  const tone = kind === 'rule' ? { bg: tokens.surface, line: tokens.line, ink: tokens.muted } : kind === 'ai' ? { bg: tokens.householdSurface, line: tokens.accent, ink: tokens.accent } : { bg: tokens.bucksSurface, line: tokens.bucks, ink: tokens.bucks };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
      <View style={{ flexShrink: 0, paddingHorizontal: tokens.spacing.sm, paddingVertical: 2, borderRadius: tokens.radii.sm, borderWidth: 1, borderColor: tone.line, backgroundColor: tone.bg }}>
        <Text variant="caption" style={{ color: tone.ink, fontWeight: '700' }}>
          {decidedLabel(decidedBy)}
        </Text>
      </View>
      {why ? (
        <Text variant="caption" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {why}
        </Text>
      ) : null}
    </View>
  );
}
