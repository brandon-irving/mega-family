// Board "Kids" (Screen 10, step make): after a parent snaps a worksheet, MEGA says what it read and offers
// "Make practice for one of the kids?" with For / Questions chips. Adults only (the server sends this card
// only to the adult who took the photo; `homework.makePractice` checks the caller is the kid's parent).
import { useState } from 'react';
import type { Id } from '@shared/domain/validators';
import { fillCopy, KIDS_COPY } from '@shared/config/copy';
import { HOMEWORK } from '@shared/config/kids';
import { useHomeworkActions, useHomeworkSheet } from '@/data/useKids';
import { useFamilyDirectory } from '@/features/shell/familyDirectory';
import { useRunAction } from '@/features/shell/useRunAction';
import { Text } from '@/ui/Text';
import { CardActions, ChipRow, ThreadCard } from '@/ui/ThreadCard';
import { CardFallback } from './CardFallback';

export type HomeworkSheetView = { status: 'reading' | 'ready' | 'failed'; topic?: string; summary?: string };
export type HomeworkOutcome = { kind: 'sent'; kidName: string; kidMega: string } | { kind: 'skipped' } | null;

const COUNTS = Array.from({ length: HOMEWORK.questions.max - HOMEWORK.questions.min + 1 }, (_, i) => String(HOMEWORK.questions.min + i));

export function HomeworkCardView({
  megaName,
  sheet,
  kids,
  outcome,
  busy,
  error,
  onMake,
  onSkip,
}: {
  megaName: string;
  sheet: HomeworkSheetView;
  kids: { id: string; label: string }[];
  outcome: HomeworkOutcome;
  busy?: boolean;
  error?: string | null;
  onMake: (kidId: string, count: number) => void;
  onSkip: () => void;
}) {
  const [kid, setKid] = useState(kids[0]?.id ?? '');
  const [count, setCount] = useState(String(HOMEWORK.questions.default));
  if (sheet.status === 'reading') return <ThreadCard from={megaName} title={KIDS_COPY.sheetReading} />;
  if (sheet.status === 'failed') return <ThreadCard from={megaName} title={KIDS_COPY.sheetFailed} />;

  const status =
    outcome?.kind === 'sent'
      ? { text: fillCopy(KIDS_COPY.sent, { kid: outcome.kidName, mega: outcome.kidMega }), tone: 'success' as const }
      : outcome?.kind === 'skipped'
        ? { text: KIDS_COPY.skipped, tone: 'muted' as const }
        : error
          ? { text: error, tone: 'warn' as const }
          : undefined;
  const read = [sheet.topic, sheet.summary].filter(Boolean).join(' · ');
  return (
    <ThreadCard from={megaName} title={KIDS_COPY.makeTitle} body={KIDS_COPY.makeBody} status={status}>
      {read ? (
        <Text variant="caption" color="muted">
          {read}
        </Text>
      ) : null}
      {!outcome && (
        <>
          <ChipRow label={KIDS_COPY.forLabel} options={kids} value={kid} onChange={setKid} />
          <ChipRow label={KIDS_COPY.questionsLabel} options={COUNTS.map((c) => ({ id: c, label: c }))} value={count} onChange={setCount} />
          <CardActions
            actions={[
              { id: 'make', label: KIDS_COPY.make, onPress: () => onMake(kid, Number(count)), loading: busy, disabled: !kid },
              { id: 'skip', label: KIDS_COPY.notNow, onPress: onSkip, variant: 'ghost', disabled: busy },
            ]}
          />
        </>
      )}
    </ThreadCard>
  );
}

export function HomeworkCard({ sheetId, megaName }: { sheetId: Id<'homeworkSheets'>; megaName: string }) {
  const sheet = useHomeworkSheet(sheetId);
  const dir = useFamilyDirectory();
  const { makePractice } = useHomeworkActions();
  const [outcome, setOutcome] = useState<HomeworkOutcome>(null);
  const { busy, error, run } = useRunAction();
  if (sheet.status !== 'ok') return <CardFallback state={sheet} from={megaName} />;
  const kids = dir.kids.filter((k) => !dir.me || dir.me.parentOf.includes(k.id)).map((k) => ({ id: k.id, label: k.name }));
  return (
    <HomeworkCardView
      megaName={megaName}
      sheet={sheet.data}
      kids={kids}
      outcome={outcome}
      busy={busy === 'make'}
      error={error}
      onSkip={() => setOutcome({ kind: 'skipped' })}
      onMake={(kidId, count) =>
        run('make', () => makePractice({ sheetId, forMemberId: kidId as Id<'members'>, count })).then((ok) => {
          if (ok) setOutcome({ kind: 'sent', kidName: dir.nameOf(kidId), kidMega: dir.megaNameOf(kidId) });
        })
      }
    />
  );
}
