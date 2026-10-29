// G8 (G8.md frontend task 4): the schedule-link field (boards IcsPaste / IcsPasteError) offers the same Paste
// button as the invite field — read only on a tap, the pasted text goes into the field.
import { act, fireEvent, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { G8_UI_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { LinkField } from './parts';

jest.mock('expo-clipboard', () => ({ isPasteButtonAvailable: false, getStringAsync: jest.fn(async () => 'webcal://school.example.org/calendar.ics') }));

test('Paste fills the schedule-link field, only when tapped', async () => {
  const onChange = jest.fn();
  await renderWithTheme(<LinkField label="Schedule link" value="" placeholder="https://…" onChange={onChange} onSubmit={jest.fn()} />);
  expect(Clipboard.getStringAsync).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: G8_UI_COPY.pasteLinkLabel })));
  expect(onChange).toHaveBeenCalledWith('webcal://school.example.org/calendar.ics');
});
