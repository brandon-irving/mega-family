// The thread renders the three G5 card kinds (CONTRACT v0.17 §3) through ResultCard, reading their live state
// from the account hooks; while the backend is still a stub (the query errors) each card shows the calm
// fallback line in its frame instead of crashing the thread.
import { screen } from '@testing-library/react-native';
import { G5_COPY, KIDS_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CARD_CONNECT_GMAIL, CARD_MAIL_FOUND, CARD_RECONNECT } from '@/test/g5Fixtures';
import { ResultCard } from '@/features/chat/Cards';

let mockState: 'ok' | 'stub' = 'ok';
const mockOk = <T,>(data: T) => (mockState === 'ok' ? { status: 'ok' as const, data } : { status: 'error' as const, error: new Error('NOT_FOUND') });
jest.mock('@/data/useAccounts', () => {
  const f = jest.requireActual('@/test/g5Fixtures');
  return {
    useOffer: () => mockOk(f.OFFER_GMAIL),
    useMailItems: () => mockOk(f.MAIL_ITEMS),
    useIntegrations: () => mockOk([f.GMAIL_NEEDS_RECONNECT]),
    useAccountActions: () => ({}),
  };
});
jest.mock('@/data/useOnboarding', () => ({ useSkipOffer: () => jest.fn() }));
jest.mock('@/data/useShopping', () => ({ useFamilyNow: () => Date.UTC(2026, 9, 29, 18) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

describe('G5 cards in the thread', () => {
  beforeEach(() => {
    mockState = 'ok';
  });

  test('connect renders from its live offer', async () => {
    await renderWithTheme(<ResultCard card={CARD_CONNECT_GMAIL} megaName="Teal" />);
    expect(screen.getByText(G5_COPY.gmailTitle)).toBeTruthy();
  });
  test('mailFound renders its rows', async () => {
    await renderWithTheme(<ResultCard card={CARD_MAIL_FOUND} megaName="Teal" />);
    expect(screen.getByText('I found 3 things worth keeping in your email.')).toBeTruthy();
  });
  test('reconnect renders for the lapsed grant', async () => {
    await renderWithTheme(<ResultCard card={CARD_RECONNECT} megaName="Teal" />);
    expect(screen.getByText(G5_COPY.reconnectTitle)).toBeTruthy();
  });

  test('while the backend is a stub: the calm fallback in the card frame, never a crash', async () => {
    mockState = 'stub';
    await renderWithTheme(<ResultCard card={CARD_CONNECT_GMAIL} megaName="Teal" />);
    expect(screen.getByText(KIDS_COPY.notReady)).toBeTruthy();
    expect(screen.getByText('Teal · Gmail')).toBeTruthy();
  });
});
