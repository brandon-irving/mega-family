// What a GD card shows before its item loads, or when the server refuses it (gone, not for this viewer, or
// still a GD stub while the backend is being built): a calm one-liner in the card frame, never a crash.
import { KIDS_COPY } from '@shared/config/copy';
import type { QueryState } from '@/data/useQuery';
import { errorCopyFor } from '@/data/errorCopy';
import { ThreadCard } from '@/ui/ThreadCard';

export function CardFallback({ state, from }: { state: QueryState<unknown>; from: string }) {
  if (state.status === 'loading') return <ThreadCard from={from} title={KIDS_COPY.loading} />;
  if (state.status === 'error') return <ThreadCard from={from} title={KIDS_COPY.notReady} body={errorCopyFor(state.error)} />;
  return null;
}
