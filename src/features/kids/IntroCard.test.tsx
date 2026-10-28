// Board KidsIntro (canvas v33): a kid's first open is never an empty chat. Their MEGA shows "Here's what we
// can do" with three rows; "Show me" asks the MEGA about that row as the kid's own message.
import { fireEvent, screen } from '@testing-library/react-native';
import { KID_INTRO } from '@shared/config/starters';
import { renderWithTheme } from '@/test/renderWithTheme';
import { IntroCardView } from './IntroCard';

describe('IntroCardView (board KidsIntro)', () => {
  test('shows the title, the MEGA line and every row from config with a Show me button', async () => {
    await renderWithTheme(<IntroCardView megaName="Sunny" asked={[]} onAsk={() => {}} />, { role: 'kid' });
    expect(screen.getByText('Here’s what we can do')).toBeTruthy();
    expect(screen.getByText('Sunny · How I help')).toBeTruthy();
    for (const row of KID_INTRO.rows) {
      expect(screen.getByText(row.title)).toBeTruthy();
      expect(screen.getByText(row.why)).toBeTruthy();
    }
    expect(screen.getAllByText('Show me')).toHaveLength(KID_INTRO.rows.length);
  });

  test('Show me asks the MEGA about that row', async () => {
    const onAsk = jest.fn();
    await renderWithTheme(<IntroCardView megaName="Sunny" asked={[]} onAsk={onAsk} />, { role: 'kid' });
    await fireEvent.press(screen.getByLabelText('Show me: Homework practice'));
    expect(onAsk).toHaveBeenCalledWith('homework', KID_INTRO.rows[1].ask);
  });
});
