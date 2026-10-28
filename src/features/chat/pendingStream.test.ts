// The chat screen's streaming line follows any MEGA reply still being written — a normal send, a block
// answer, a kid's "Show me", or the MEGA's own starter (chat.start) — not only the viewer's last send.
import { FIXTURE_IDS, MESSAGES_BY_TYPE } from '@/test/fixtures';
import { pendingMegaStreamId } from './pendingStream';

const mega = (text: string, streamId?: string) => ({ ...MESSAGES_BY_TYPE.text, author: { kind: 'mega' as const, id: FIXTURE_IDS.teal }, body: { type: 'text' as const, text }, streamId });

describe('pendingMegaStreamId', () => {
  test('the newest MEGA message that is still empty and streaming', () => {
    expect(pendingMegaStreamId([mega('', 's2'), mega('done', 's1')])).toBe('s2');
  });
  test('nothing once the newest MEGA message has its text', () => {
    expect(pendingMegaStreamId([mega('All set.', 's2')])).toBeNull();
  });
  test('nothing for an empty thread', () => {
    expect(pendingMegaStreamId([])).toBeNull();
  });
});
