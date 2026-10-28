// Board SearchLog: a kid's blocked and changed searches, for their parents only (G4 invariant 4: only
// `blocked`/`rephrased` rows, and only while the kid's `tellsParents.blockedSearches` is on — the server
// enforces both). The switch at the top is that kid control; off, the page says what turning it on shows.
import { Pressable, View } from 'react-native';
import { G4_COPY, fillCopy } from '@shared/config/copy';
import { KID_SAFETY } from '@shared/config/kidSafety';
import { addDays, formatLocalTime, formatLocalWeekday, localDate } from '@shared/time';
import { Text } from '@/ui/Text';
import { LockNote } from '@/ui/ThreadCard';
import { useTokens } from '@/ui/theme';
import type { SearchLogRow } from './types';

/** "Today · 4:12 PM", "Yesterday · 6:40 PM", else "Mon · 3:05 PM" (the family's timezone). */
export function whenLabel(at: number, now: number, tz: string): string {
  const day = localDate(at, tz);
  const today = localDate(now, tz);
  const prefix = day === today ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : formatLocalWeekday(at, tz);
  return `${prefix} · ${formatLocalTime(at, tz)}`;
}

export type SearchLogContentProps = {
  kidName: string;
  /** The kid's `tellsParents.blockedSearches`. */
  on: boolean;
  onToggle: (next: boolean) => void;
  /** Blocked/changed rows (newest first), or null while off / not loaded. */
  rows: SearchLogRow[] | null;
  tz: string;
  now: number;
  busy?: boolean;
};

export function SearchLogContent({ kidName, on, onToggle, rows, tz, now, busy }: SearchLogContentProps) {
  const tokens = useTokens();
  const shown = (rows ?? []).filter((r) => r.outcome === 'blocked' || r.outcome === 'rephrased');
  return (
    <View style={{ gap: tokens.spacing.md }}>
      <Pressable
        onPress={() => onToggle(!on)}
        disabled={busy}
        accessibilityRole="switch"
        accessibilityState={{ checked: on, disabled: busy }}
        aria-checked={on}
        accessibilityLabel={G4_COPY.searchesToggle}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md, minHeight: 64, borderRadius: tokens.radii.lg, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.line, paddingVertical: tokens.spacing.md, paddingHorizontal: tokens.spacing.lg }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{G4_COPY.searchesToggle}</Text>
          <Text variant="caption" color="muted">
            {on ? G4_COPY.searchesToggleOn : G4_COPY.searchesToggleOff}
          </Text>
        </View>
        <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: on ? tokens.accent : tokens.line, justifyContent: 'center', paddingHorizontal: 3, alignItems: on ? 'flex-end' : 'flex-start' }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: tokens.bg }} />
        </View>
      </Pressable>

      {!on ? <Text color="muted">{fillCopy(G4_COPY.searchesOff, { kid: kidName })}</Text> : null}
      {on && rows !== null && shown.length === 0 ? <Text color="muted">{fillCopy(G4_COPY.searchesNone, { kid: kidName })}</Text> : null}

      {on
        ? shown.map((r) => {
            const blocked = r.outcome === 'blocked';
            return (
              <View key={r._id} testID={`search-log-${r._id}`} style={{ gap: 6, borderRadius: tokens.radii.lg, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.line, paddingVertical: tokens.spacing.md, paddingHorizontal: tokens.spacing.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm }}>
                  <View style={{ paddingHorizontal: tokens.spacing.sm, paddingVertical: 2, borderRadius: tokens.radii.sm, backgroundColor: blocked ? tokens.dangerSurface : tokens.warnSurface }}>
                    <Text variant="caption" weight="700" numberOfLines={1} style={{ color: blocked ? tokens.danger : tokens.warn }}>
                      {blocked ? G4_COPY.searchesTagBlocked : G4_COPY.searchesTagChanged}
                    </Text>
                  </View>
                  <Text variant="caption" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {whenLabel(r.at, now, tz)}
                  </Text>
                </View>
                <Text variant="label">{fillCopy(G4_COPY.searchQuoted, { text: r.query })}</Text>
                <Text variant="caption" color="muted">
                  {blocked
                    ? fillCopy(G4_COPY.searchesBlockedWhat, { kid: kidName, message: KID_SAFETY.blockedMessage })
                    : fillCopy(G4_COPY.searchesChangedWhat, { text: r.rephrasedTo ?? '' })}
                </Text>
              </View>
            );
          })
        : null}

      <LockNote text={fillCopy(G4_COPY.searchesFoot, { kid: kidName })} />
    </View>
  );
}
