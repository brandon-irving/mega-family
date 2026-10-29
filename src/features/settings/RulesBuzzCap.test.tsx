// Board ProfileRules: "Buzzes a day" with 44pt − / + for a parent (locked for the kid). A kid's cap lives in
// the kid's own notification settings, which parents couldn't set; the backend fix agent adds
// `kidControls.notifyCap` / `kidControls.setNotifyCap` (CONTRACT v0.17b, pending). The row shows only once the
// server reports the cap — never a stepper that can't save.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { G5_FIX_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { RulesContent, type KidControls } from './RulesContent';

const CONTROLS = {
  _id: 'kc_1',
  _creationTime: 0,
  familyId: 'f',
  memberId: 'm_twin1',
  homeworkMode: true,
  quietHours: { start: '20:30', end: '07:00' },
  dailyMinutes: 60,
  blockedTopics: [],
  tellsParents: { safety: true, blockedSearches: true, summary: 'weekly' },
  parentsCanReadChat: true,
  webSearch: true,
} as unknown as KidControls;

const base = { controls: CONTROLS, kidName: 'Twin 1', mega: null, parents: 'Admin and Partner', onPatch: jest.fn() };

describe('Buzzes a day', () => {
  test('a parent steps it with − / +, within its limits', async () => {
    const onBuzzCap = jest.fn();
    await renderWithTheme(<RulesContent {...base} editable buzzCap={{ value: 4, min: 0, max: 10 }} onBuzzCap={onBuzzCap} />);
    expect(screen.getByText(G5_FIX_COPY.buzzesTitle)).toBeTruthy();
    expect(screen.getByText(fillCopy(G5_FIX_COPY.buzzesValue, { n: 4 }))).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(fillCopy(G5_FIX_COPY.buzzesMore, { label: G5_FIX_COPY.buzzesTitle })));
    });
    expect(onBuzzCap).toHaveBeenCalledWith(5);
  });

  test('the kid sees it locked, set by a parent', async () => {
    await renderWithTheme(<RulesContent {...base} editable={false} buzzCap={{ value: 4, min: 0, max: 10 }} />);
    expect(screen.getByText(G5_FIX_COPY.buzzesTitle)).toBeTruthy();
    expect(screen.getAllByText(U.setByParent).length).toBeGreaterThan(0);
  });

  test('until the server reports the cap, no row (no stepper that can’t save)', async () => {
    await renderWithTheme(<RulesContent {...base} editable />);
    expect(screen.queryByText(G5_FIX_COPY.buzzesTitle)).toBeNull();
  });
});
