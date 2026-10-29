// Boards HolidayAsk / HolidayPaused: the evening before a weekday public holiday, adults get one question
// (CONTRACT v0.16 `holiday` card → `holidays.question`): "{day} is {name}. Pause the morning routine and chores
// for {kids}?", why MEGA asks instead of guessing, and Pause for the day / Keep as usual stacked full width.
// Once anyone answers (first answer wins, `holidays.answer`), the buttons give way to who decided. Kids never see
// this card (the server sends it to adults only and `holidays.question` refuses kids). The kid's side is their
// bedtime prep, which the backend writes into the routine run itself (`G4B_COPY.bedtimeNoRoutine`), so it
// renders through the existing RoutineCard with no change here.
import type { Id } from '@shared/domain/validators';
import type { RoutineSkip } from '@shared/domain/api';
import { G4B_COPY, G4B_UI_COPY, fillCopy } from '@shared/config/copy';
import { useHolidayAnswer, useHolidayQuestion } from '@/data/useShopping';
import { useFamilyDirectory } from '@/features/shell/familyDirectory';
import { useRunAction } from '@/features/shell/useRunAction';
import { CardFallback } from '@/features/kids/CardFallback';
import { IconCard } from '@/features/integrations/G4Card';
import { CardActions } from '@/ui/ThreadCard';
import { useTokens } from '@/ui/theme';

/** "Wednesday" for "2026-11-11" (the date is already the family's local date). */
export function weekdayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

/** "Twin 1 and Twin 2", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export type HolidayAction = 'pause' | 'keep';

export function HolidayCardView({
  skip,
  megaName,
  nameOf,
  busy,
  error,
  onAnswer,
}: {
  skip: RoutineSkip;
  megaName: string;
  nameOf: (id: string) => string;
  busy?: string | null;
  error?: string | null;
  onAnswer: (action: HolidayAction) => void;
}) {
  const tokens = useTokens();
  const day = weekdayOf(skip.date);
  const kids = joinNames(skip.memberIds.map(nameOf).filter(Boolean));
  const by = (skip.answeredBy && nameOf(skip.answeredBy)) || G4B_UI_COPY.someone;
  const status =
    skip.status === 'paused'
      ? { text: fillCopy(G4B_COPY.holidayPaused, { day, by }), color: tokens.accent }
      : skip.status === 'kept'
        ? { text: fillCopy(G4B_COPY.holidayKept, { day, by }), color: tokens.muted }
        : error
          ? { text: error, color: tokens.warn }
          : null;
  const action = (id: HolidayAction, label: string, variant?: 'ghost') => ({ id, label, variant, onPress: () => onAnswer(id), loading: busy === id, disabled: !!busy && busy !== id });
  return (
    <IconCard
      from={fillCopy(G4B_UI_COPY.holidayFrom, { mega: megaName })}
      icon="flag"
      title={fillCopy(kids ? G4B_COPY.holidayQuestion : G4B_COPY.holidayQuestionTitle, { day, name: skip.holidayName, kids })}
      body={G4B_COPY.holidayWhy}
      status={status}
      foot={G4B_UI_COPY.holidayFoot}
      testID="holiday-card"
    >
      {skip.status === 'asked' ? <CardActions cols={1} actions={[action('pause', G4B_COPY.holidayPause), action('keep', G4B_COPY.holidayKeep, 'ghost')]} /> : null}
    </IconCard>
  );
}

export function HolidayCard({ skipId, megaName }: { skipId: Id<'routineSkips'>; megaName: string }) {
  const state = useHolidayQuestion(skipId);
  const answer = useHolidayAnswer();
  const dir = useFamilyDirectory();
  const { busy, error, run } = useRunAction();
  if (state.status !== 'ok') return <CardFallback state={state} from={fillCopy(G4B_UI_COPY.holidayFrom, { mega: megaName })} />;
  return <HolidayCardView skip={state.data} megaName={megaName} nameOf={(id) => dir.nameOf(id)} busy={busy} error={error} onAnswer={(a) => void run(a, () => answer({ skipId, action: a }))} />;
}
