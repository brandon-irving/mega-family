// G4 UX review HIGH (Oct 28): a card's first load showed a bare "Loading…" heading. It shows the card's
// skeleton instead (its "from" line plus placeholder bars), never the word alone.
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CardFallback } from './CardFallback';

test('loading shows the card skeleton, not a "Loading…" line', async () => {
  await renderWithTheme(<CardFallback state={{ status: 'loading' }} from="Hub · Gift ideas" />);
  expect(screen.queryByText('Loading…')).toBeNull();
  expect(screen.getByTestId('card-skeleton')).toBeTruthy();
  expect(screen.getByText('Hub · Gift ideas')).toBeTruthy();
});
