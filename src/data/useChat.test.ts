// No-flicker rule: the optimistic row useSendMessage inserts matches chat.send's real shape, and two
// sends in a row never collide on `_id` (each optimistic entry needs its own FlatList key — a collision
// would make React treat a second in-flight send as "the same row" as the first).
import type { Infer } from 'convex/values';
import type { viewer as viewerValidator } from '@shared/domain/api';
import { FIXTURE_IDS } from '@/test/fixtures';
import { buildOptimisticMessage, useChatThread } from './useChat';
import { renderHook } from '@testing-library/react-native';
import { usePaginatedQuery } from 'convex/react';
import { useViewer } from './useViewer';
import { api } from './api';

jest.mock('./useViewer', () => ({ useViewer: jest.fn() }));
jest.mock('convex/react', () => ({ ...jest.requireActual('convex/react'), usePaginatedQuery: jest.fn() }));

type Viewer = Infer<typeof viewerValidator>;

// Only `family._id` and `member._id` are read by buildOptimisticMessage — the rest of a real Viewer
// (settings, theme, mega, …) isn't relevant here, so this fake only fills in what's used.
const VIEWER = { family: { _id: FIXTURE_IDS.family }, member: { _id: FIXTURE_IDS.admin } } as Viewer;

describe('buildOptimisticMessage', () => {
  test('matches the real send: same text/mentions/via, authored by the viewer', () => {
    const msg = buildOptimisticMessage(VIEWER, { text: 'Ask Zap about homework', mentions: [FIXTURE_IDS.zap], via: 'voice' });
    expect(msg.author).toEqual({ kind: 'member', id: FIXTURE_IDS.admin });
    expect(msg.familyId).toBe(FIXTURE_IDS.family);
    expect(msg.via).toBe('voice');
    expect(msg.chips).toEqual([]);
    expect(msg.body).toEqual({ type: 'text', text: 'Ask Zap about homework', mentions: [FIXTURE_IDS.zap] });
  });

  test('two sends never collide on _id (each is its own FlatList row, swapped in place when the real one lands)', () => {
    const a = buildOptimisticMessage(VIEWER, { text: 'first', via: 'text' });
    const b = buildOptimisticMessage(VIEWER, { text: 'second', via: 'text' });
    expect(a._id).not.toBe(b._id);
  });
});

test('chat pagination is keyed to the current profile and skips until a viewer exists', async () => {
  (usePaginatedQuery as jest.Mock).mockReturnValue({ status: 'LoadingFirstPage', results: [], loadMore: jest.fn() });
  (useViewer as jest.Mock).mockReturnValue(undefined);
  const { rerender } = await renderHook(() => useChatThread());
  expect(usePaginatedQuery).toHaveBeenLastCalledWith(api.chat.thread, 'skip', { initialNumItems: 30 });
  (useViewer as jest.Mock).mockReturnValue(VIEWER);
  await rerender(undefined);
  expect(usePaginatedQuery).toHaveBeenLastCalledWith(api.chat.thread, { profileKey: VIEWER.member._id }, { initialNumItems: 30 });
  (useViewer as jest.Mock).mockReturnValue({ ...VIEWER, member: { _id: 'new-demo-member' } });
  await rerender(undefined);
  expect(usePaginatedQuery).toHaveBeenLastCalledWith(api.chat.thread, { profileKey: 'new-demo-member' }, { initialNumItems: 30 });
});
