// Board CalGifts: gift ideas for an upcoming birthday, with "Based on what's shared" tags (the server only
// ever cites household-shared facts, config GIFTS.sourceScopes) and Add to list on each idea. Adults only,
// never the birthday person — the server enforces both; this card just renders what it's allowed to see.
import { View } from 'react-native';
import type { Infer } from 'convex/values';
import type { giftIdeasDoc } from '@shared/domain/api';
import type { Id } from '@shared/domain/validators';
import { CALENDAR_COPY, fillCopy } from '@shared/config/copy';
import { useAddGiftToList, useGiftIdeas } from '@/data/useCalendarLayers';
import { useFamilyDirectory } from '@/features/shell/familyDirectory';
import { useRunAction } from '@/features/shell/useRunAction';
import { CardFallback } from '@/features/kids/CardFallback';
import { IdeaRow, TagList, ThreadCard } from '@/ui/ThreadCard';
import { useTokens } from '@/ui/theme';

export type GiftIdeas = Infer<typeof giftIdeasDoc>;

export function GiftsCardView({ megaName, forName, gifts, busy, error, onAdd }: { megaName: string; forName: string; gifts: GiftIdeas; busy?: string | null; error?: string | null; onAdd: (index: number) => void }) {
  const tokens = useTokens();
  const title = fillCopy(CALENDAR_COPY.giftsTitle, { name: forName });
  if (gifts.status === 'queued') return <ThreadCard from={megaName} title={title} body={CALENDAR_COPY.giftsQueued} />;
  if (gifts.status === 'failed') return <ThreadCard from={megaName} title={title} body={CALENDAR_COPY.giftsFailed} />;
  return (
    <ThreadCard from={megaName} title={title} foot={CALENDAR_COPY.giftsFoot} status={error ? { text: error, tone: 'warn' } : undefined}>
      <TagList label={CALENDAR_COPY.giftsBasedOn} tags={gifts.basedOn.map((b) => b.label)} />
      <View style={{ gap: tokens.spacing.sm }}>
        {gifts.ideas.map((idea, i) => {
          const done = gifts.addedToList.includes(i);
          return (
            <IdeaRow
              key={`${i}:${idea.title}`}
              title={idea.title}
              why={[idea.why, idea.price].filter(Boolean).join(' · ')}
              actionLabel={done ? CALENDAR_COPY.giftsAdded : CALENDAR_COPY.giftsAdd}
              done={done}
              loading={busy === `add${i}`}
              onPress={() => onAdd(i)}
            />
          );
        })}
      </View>
    </ThreadCard>
  );
}

export function GiftsCard({ giftIdeasId, megaName }: { giftIdeasId: Id<'giftIdeas'>; megaName: string }) {
  const state = useGiftIdeas(giftIdeasId);
  const dir = useFamilyDirectory();
  const add = useAddGiftToList();
  const { busy, error, run } = useRunAction();
  if (state.status !== 'ok') return <CardFallback state={state} from={megaName} />;
  return (
    <GiftsCardView
      megaName={megaName}
      forName={dir.nameOf(state.data.forMemberId)}
      gifts={state.data}
      busy={busy}
      error={error}
      onAdd={(index) => run(`add${index}`, () => add({ giftIdeasId, index }))}
    />
  );
}
