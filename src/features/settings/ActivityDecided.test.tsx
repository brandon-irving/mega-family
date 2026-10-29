// Board ProfileActivity: each row says who decided — Rule · MEGA (AI) · You — with a short reason. The backend
// fix agent adds `decidedBy` (rule:<id> | model:<id> | member:<id>) and `why` to `megas.activity` (CONTRACT
// v0.17b, pending); rows without it show no chip rather than a guess.
import { screen } from '@testing-library/react-native';
import { G5_FIX_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ActivityContent, decidedLabel } from './ActivityContent';

const T0 = Date.UTC(2026, 9, 29, 18, 0);
const base = { memories: [], forgotten: [], megaName: 'Teal', now: T0, timeZone: 'America/New_York', canLoadMore: false, onLoadMore: () => {}, onOpenMemories: () => {}, filter: 'all' as const, onFilter: () => {}, onForget: () => {} };

describe('who decided', () => {
  const WHO = { viewerId: 'm_admin', names: { m_admin: 'Admin', m_partner: 'Partner' } };

  test('rule: and model: map to Rule and MEGA (AI); the viewer’s own member:<id> is You', () => {
    expect(decidedLabel('rule:quietHours', WHO)).toBe(G5_FIX_COPY.decidedRule);
    expect(decidedLabel('model:muse-spark-1.3', WHO)).toBe(G5_FIX_COPY.decidedAi);
    expect(decidedLabel('member:m_admin', WHO)).toBe(G5_FIX_COPY.decidedYou);
    expect(decidedLabel(undefined, WHO)).toBeNull();
  });

  test('someone else’s member:<id> is their name, never "You"', () => {
    expect(decidedLabel('member:m_partner', WHO)).toBe('Partner');
  });

  test('a bare "member", or an id not in the family, is "A family member"; anything unknown shows no chip', () => {
    expect(decidedLabel('member', WHO)).toBe(G5_FIX_COPY.decidedSomeone);
    expect(decidedLabel('member:m_gone', WHO)).toBe(G5_FIX_COPY.decidedSomeone);
    expect(decidedLabel('something-else', WHO)).toBeNull();
  });

  test('a row Partner decided shows "Partner" to the admin', async () => {
    const items = [{ at: T0 - 60_000, type: 'calendar.changed', summary: 'Moved soccer pickup', decidedBy: 'member:m_partner' }];
    await renderWithTheme(<ActivityContent {...base} who={WHO} items={items as never} />);
    expect(screen.getByText('Partner')).toBeTruthy();
    expect(screen.queryByText(G5_FIX_COPY.decidedYou)).toBeNull();
  });

  test('a row with decidedBy shows the chip and its reason; one without shows none', async () => {
    const items = [
      { at: T0 - 60_000, type: 'reminder.due', summary: 'Held Twin 2’s chore reminder until 7:00 AM', decidedBy: 'rule:quietHours', why: 'Quiet hours' },
      { at: T0 - 120_000, type: 'calendar.changed', summary: 'Added Picture day to your private calendar' },
    ];
    await renderWithTheme(<ActivityContent {...base} who={{ viewerId: 'm_admin', names: {} }} items={items as never} />);
    expect(screen.getByText(G5_FIX_COPY.decidedRule)).toBeTruthy();
    expect(screen.getByText('Quiet hours')).toBeTruthy();
    expect(screen.queryByText(G5_FIX_COPY.decidedAi)).toBeNull();
  });
});
