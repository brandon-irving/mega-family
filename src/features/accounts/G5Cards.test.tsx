// G5 (CONTRACT v0.17) chat cards, fed by the contract-shaped fixtures (src/test/g5Fixtures.ts): the onboarding
// `connect` card for Gmail / calendar / schedule links (boards OnboardGmail, OnboardGmailConnected,
// OnboardCalendar, OnboardIcs, ConnectNotSetUp, IcsPaste*, PhoneCalendar*), the `mailFound` card (OnboardGmailFound,
// MailFoundRemove, MailFoundNone), the `reconnect` card (Reconnect) and the phone-calendar picker sheet. Also the
// onboarding promise that skipping never blocks: every offer has Not now, and a skipped card keeps its line
// instead of a dead end.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';
import type { OfferView } from '@shared/domain/api';
import { G5_COPY, G5_UI_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import {
  GMAIL_CONNECTED,
  GMAIL_NEEDS_RECONNECT,
  GOOGLE_CAL_CONNECTED,
  MAIL_ITEMS,
  MAIL_ITEM_DISMISSED,
  OFFER_CALENDAR,
  OFFER_CALENDAR_PHONE,
  OFFER_GMAIL,
  OFFER_GMAIL_CONNECTED,
  OFFER_GMAIL_FAILED,
  OFFER_GMAIL_SKIPPED,
  OFFER_GMAIL_UNAVAILABLE,
  OFFER_ICS,
  OFFER_ICS_ADDED,
  T0,
} from '@/test/g5Fixtures';
import { ConnectCardView, looksLikeFeedUrl, type ConnectHandlers, type ConnectLocal } from './ConnectCard';
import { MailFoundCardView, foundTitle } from './MailFoundCard';
import { ReconnectCardView } from './ReconnectCard';
import { PhoneCalendarSheet, addLabel } from './PhoneCalendarSheet';
import { agoText, checkedLine, mailRow, reconnectWhat, statusPill, whenText } from './accountFormat';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

/** Every press inside act (React 19: overlapping sync acts leave the next render empty). */
const press = (el: Parameters<typeof fireEvent.press>[0]) => act(async () => {
  fireEvent.press(el);
});
const type = (el: Parameters<typeof fireEvent.changeText>[0], text: string) => act(async () => {
  fireEvent.changeText(el, text);
});

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const inSafeArea = (ui: ReactElement) => renderWithTheme(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);

const handlers = (): ConnectHandlers => ({
  onGoogle: jest.fn(),
  onPhone: jest.fn(),
  onOpenSettings: jest.fn(),
  onSkip: jest.fn(),
  onIcsChange: jest.fn(),
  onIcsSubmit: jest.fn(),
  onIcsAnother: jest.fn(),
  onIcsDone: jest.fn(),
});
const local = (over: Partial<ConnectLocal> = {}): ConnectLocal => ({ phoneSupported: true, icsText: '', ...over });
async function card(view: OfferView, over: Partial<ConnectLocal> = {}, on = handlers()) {
  await renderWithTheme(<ConnectCardView view={view} megaName="Teal" local={local(over)} on={on} />);
  return on;
}

describe('connect card · Gmail (boards OnboardGmail / OnboardGmailConnected / ConnectNotSetUp)', () => {
  test('offered: what MEGA reads (one line of tags), Connect Gmail and Not now, private foot', async () => {
    const on = await card(OFFER_GMAIL);
    expect(screen.getByText(G5_COPY.gmailTitle)).toBeTruthy();
    expect(screen.getByText('Teal · Gmail')).toBeTruthy();
    expect(screen.getByTestId('tag-list')).toBeTruthy();
    expect(screen.getByText(G5_COPY.privateFoot)).toBeTruthy();
    await press(screen.getByText(G5_COPY.gmailConnect));
    expect(on.onGoogle).toHaveBeenCalled();
    await press(screen.getByText(G5_COPY.notNow));
    expect(on.onSkip).toHaveBeenCalled();
  });

  test('connected: the connected line, no buttons left', async () => {
    await card(OFFER_GMAIL_CONNECTED);
    expect(screen.getByText('Gmail connected · checking the last 30 days')).toBeTruthy();
    expect(screen.queryByText(G5_COPY.gmailConnect)).toBeNull();
    expect(screen.queryByText(G5_COPY.notNow)).toBeNull();
  });

  test('skipped: the skipped line instead of buttons (skipping never blocks)', async () => {
    await card(OFFER_GMAIL_SKIPPED);
    expect(screen.getByText(G5_COPY.gmailSkipped)).toBeTruthy();
    expect(screen.queryByText(G5_COPY.notNow)).toBeNull();
  });

  test('failed: says so and offers Try again next to Not now', async () => {
    const on = await card(OFFER_GMAIL_FAILED);
    expect(screen.getByText(G5_UI_COPY.connectFailed)).toBeTruthy();
    await press(screen.getByText(G5_UI_COPY.tryAgain));
    expect(on.onGoogle).toHaveBeenCalled();
  });

  test('Google not set up: an honest card with only Not now (never a dead Connect button)', async () => {
    await card(OFFER_GMAIL_UNAVAILABLE);
    expect(screen.getByText(G5_UI_COPY.gmailNotSetUpTitle)).toBeTruthy();
    expect(screen.queryByText(G5_COPY.gmailConnect)).toBeNull();
    expect(screen.getByText(G5_COPY.notNow)).toBeTruthy();
  });

  test('while Google opens: the button spins and the line says so', async () => {
    await card(OFFER_GMAIL, { busy: 'google' });
    expect(screen.getByText(G5_UI_COPY.connecting)).toBeTruthy();
  });
});

describe('connect card · calendar (boards OnboardCalendar / PhoneCalendarDenied / PhoneCalendarWeb)', () => {
  test('offered: Google Calendar and this phone as option rows, then Not now', async () => {
    const on = await card(OFFER_CALENDAR);
    await press(screen.getByLabelText(`${G5_COPY.calendarGoogle}. ${G5_UI_COPY.calendarGoogleSub}`));
    expect(on.onGoogle).toHaveBeenCalled();
    await press(screen.getByLabelText(`${G5_COPY.calendarPhone}. ${G5_UI_COPY.calendarPhoneSub}`));
    expect(on.onPhone).toHaveBeenCalled();
    expect(screen.getByText(G5_COPY.notNow)).toBeTruthy();
  });

  test('web: the phone row is dashed and not tappable, with "Open MEGA on your phone…"', async () => {
    const on = await card(OFFER_CALENDAR, { phoneSupported: false });
    const phone = screen.getByLabelText(`${G5_COPY.calendarPhone}. ${G5_COPY.calendarPhoneWebOnly}`);
    expect(phone.props.accessibilityState.disabled).toBe(true);
    await press(phone);
    expect(on.onPhone).not.toHaveBeenCalled();
  });

  test('Google not set up: Google Calendar is the dashed "Not set up yet" row, the phone still works', async () => {
    const on = await card({ ...OFFER_CALENDAR, available: { google: false } });
    await press(screen.getByLabelText(`${G5_COPY.calendarGoogle}. ${G5_UI_COPY.notSetUpSub}`));
    expect(on.onGoogle).not.toHaveBeenCalled();
    await press(screen.getByLabelText(`${G5_COPY.calendarPhone}. ${G5_UI_COPY.calendarPhoneSub}`));
    expect(on.onPhone).toHaveBeenCalled();
  });

  test('phone permission denied: Open Settings / Use Google Calendar instead / Not now, stacked', async () => {
    const on = await card(OFFER_CALENDAR, { phoneDenied: true });
    expect(screen.getByText(G5_UI_COPY.phoneDeniedTitle)).toBeTruthy();
    await press(screen.getByText(G5_UI_COPY.openSettings));
    expect(on.onOpenSettings).toHaveBeenCalled();
    await press(screen.getByText(G5_UI_COPY.useGoogleInstead));
    expect(on.onGoogle).toHaveBeenCalled();
    expect(screen.getAllByTestId('button-row-line')).toHaveLength(3);
  });

  test('connected: the phone line counts this month’s events; Google’s when it was Google', async () => {
    await card(OFFER_CALENDAR_PHONE);
    expect(screen.getByText('Phone calendar added · 24 events this month')).toBeTruthy();
  });
  test('connected with Google: the Google line', async () => {
    await card({ ...OFFER_CALENDAR, state: 'connected', integrations: [GOOGLE_CAL_CONNECTED] });
    expect(screen.getByText('Google Calendar connected · 24 events this month')).toBeTruthy();
  });
});

describe('connect card · schedule links (boards OnboardIcs / IcsPaste / IcsPasteError / IcsPasteAdded)', () => {
  test('offered: a labelled field, Add link and Not now stacked full width', async () => {
    const on = await card(OFFER_ICS, { icsText: 'https://school.example/feed.ics' });
    expect(screen.getByText(G5_UI_COPY.icsFieldLabel.toUpperCase())).toBeTruthy();
    await type(screen.getByTestId('ics-field'), 'webcal://x.example/a.ics');
    expect(on.onIcsChange).toHaveBeenCalledWith('webcal://x.example/a.ics');
    await press(screen.getByText(G5_UI_COPY.icsAdd));
    expect(on.onIcsSubmit).toHaveBeenCalled();
    expect(screen.getAllByTestId('button-row-line')).toHaveLength(2);
  });

  test('a bad link: aria-invalid on the field and the error announced (role alert)', async () => {
    await card(OFFER_ICS, { icsText: 'nope', icsError: G5_COPY.icsBad });
    expect(screen.getByTestId('ics-field').props['aria-invalid']).toBe('true');
    expect(screen.getByRole('alert')).toHaveTextContent(G5_COPY.icsBad);
  });

  test('added: the feed’s title and how many events, then Paste another / Done', async () => {
    const on = await card(OFFER_ICS_ADDED, { icsAdded: { label: 'Soccer · Fall season', events: 9 } });
    expect(screen.getByText('Added “Soccer · Fall season” · updates every few hours')).toBeTruthy();
    expect(screen.getByText(/9 events from this link/)).toBeTruthy();
    expect(screen.getByText(G5_UI_COPY.done)).toBeTruthy();
    await press(screen.getByText(G5_UI_COPY.icsPasteAnother));
    expect(on.onIcsAnother).toHaveBeenCalled();
  });

  test('Paste another reopens the field on a connected card, without Not now', async () => {
    await card(OFFER_ICS_ADDED, { icsReopen: true });
    expect(screen.getByTestId('ics-field')).toBeTruthy();
    expect(screen.queryByText(G5_COPY.notNow)).toBeNull();
  });

  test('which links the app tries: https and webcal only', () => {
    expect(looksLikeFeedUrl('https://a.example/x.ics')).toBe(true);
    expect(looksLikeFeedUrl('webcal://a.example/x')).toBe(true);
    expect(looksLikeFeedUrl('http://a.example/x.ics')).toBe(false);
    expect(looksLikeFeedUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('onboarding: skipping never blocks', () => {
  const offers = [OFFER_GMAIL, OFFER_CALENDAR, OFFER_ICS];
  const lines = { gmail: G5_COPY.gmailSkipped, calendar: G5_COPY.calendarSkipped, ics: G5_COPY.icsSkipped };
  test.each(offers.map((o) => [o.offer, o] as const))('%s: Not now is always there and skips', async (_name, offer) => {
    const on = await card(offer);
    await press(screen.getByText(G5_COPY.notNow));
    expect(on.onSkip).toHaveBeenCalledTimes(1);
  });
  test.each(offers.map((o) => [o.offer, o] as const))('%s skipped: its line stays, nothing left to press', async (_name, offer) => {
    await card({ ...offer, state: 'skipped' });
    expect(screen.getByText(lines[offer.offer])).toBeTruthy();
    expect(screen.queryAllByRole('button').filter((b) => b.props.accessibilityState?.disabled !== true)).toHaveLength(0);
  });
});

describe('found mail (boards OnboardGmailFound / MailFoundRemove / MailFoundNone)', () => {
  test('rows: title (a bill with its amount), date and who it’s from; × removes that item', async () => {
    const onRemove = jest.fn();
    await renderWithTheme(<MailFoundCardView items={MAIL_ITEMS} megaName="Teal" onRemove={onRemove} />);
    expect(screen.getByText('I found 3 things worth keeping in your email.')).toBeTruthy();
    expect(screen.getByText('Water bill due $48')).toBeTruthy();
    expect(screen.getByText('Due Thu, Nov 12 · From the city')).toBeTruthy();
    expect(screen.getByText('Tue, Nov 3 · 3:30 PM · From the dental office')).toBeTruthy();
    await press(screen.getByLabelText('Remove Picture day'));
    expect(onRemove).toHaveBeenCalledWith(MAIL_ITEMS[0].itemId);
    expect(screen.getByText(G5_COPY.foundFoot)).toBeTruthy();
  });

  test('a removed row collapses to one line and the count follows', async () => {
    await renderWithTheme(<MailFoundCardView items={[MAIL_ITEMS[0], MAIL_ITEMS[1], MAIL_ITEM_DISMISSED]} megaName="Teal" onRemove={() => {}} />);
    expect(screen.getByText('I found 2 things worth keeping in your email.')).toBeTruthy();
    expect(screen.getByText('Removed “Water bill due”.')).toBeTruthy();
    expect(screen.queryByLabelText('Remove Water bill due')).toBeNull();
  });

  test('nothing found: a full card, never empty', async () => {
    await renderWithTheme(<MailFoundCardView items={[]} megaName="Teal" onRemove={() => {}} />);
    expect(screen.getByText(foundTitle(0))).toBeTruthy();
    expect(screen.getByText(G5_UI_COPY.foundNoneBody)).toBeTruthy();
    expect(foundTitle(1)).toBe(G5_COPY.foundIntroOne);
  });
});

describe('reconnect (board Reconnect)', () => {
  const props = { megaName: 'Teal', later: false, busy: false, failed: false, onReconnect: jest.fn(), onLater: jest.fn() };
  test('says what it can’t check, Reconnect / Not now stacked, the testing note as foot', async () => {
    await renderWithTheme(<ReconnectCardView {...props} google={[GMAIL_NEEDS_RECONNECT, { ...GOOGLE_CAL_CONNECTED, status: 'needs_reconnect' }]} />);
    expect(screen.getByText(G5_COPY.reconnectTitle)).toBeTruthy();
    expect(screen.getByText(/your Gmail and Google Calendar/)).toBeTruthy();
    expect(screen.getByText(G5_COPY.gmailTestingNote)).toBeTruthy();
    expect(screen.getAllByTestId('button-row-line')).toHaveLength(2);
    await press(screen.getByText(G5_COPY.accountReconnect));
    expect(props.onReconnect).toHaveBeenCalled();
  });
  test('Not now says where to reconnect later', async () => {
    await renderWithTheme(<ReconnectCardView {...props} later google={[GMAIL_NEEDS_RECONNECT]} />);
    expect(screen.getByText(G5_UI_COPY.reconnectLater)).toBeTruthy();
    expect(screen.queryByText(G5_COPY.accountReconnect)).toBeNull();
  });
  test('once connected again the card says so', async () => {
    await renderWithTheme(<ReconnectCardView {...props} google={[GMAIL_CONNECTED]} />);
    expect(screen.getByText(G5_COPY.accountConnected)).toBeTruthy();
  });
});

describe('phone calendar picker (board PhoneCalendarPick)', () => {
  const calendars = [
    { id: 'home', label: 'Home', source: 'iCloud' },
    { id: 'work', label: 'Work', source: 'Exchange' },
  ];
  test('checkbox rows, the private note, and "Add N calendars" (or "Pick at least one")', async () => {
    const onToggle = jest.fn();
    const onAdd = jest.fn();
    await inSafeArea(<PhoneCalendarSheet open calendars={calendars} picks={['home']} onToggle={onToggle} onAdd={onAdd} onClose={() => {}} />);
    const home = screen.getByLabelText('Home, iCloud');
    expect(home.props.accessibilityState.checked).toBe(true);
    await press(screen.getByLabelText('Work, Exchange'));
    expect(onToggle).toHaveBeenCalledWith('work');
    expect(screen.getByText(G5_UI_COPY.pickFoot)).toBeTruthy();
    await press(screen.getByText('Add 1 calendar'));
    expect(onAdd).toHaveBeenCalled();
    expect(addLabel(0)).toBe(G5_UI_COPY.pickNone);
    expect(addLabel(3)).toBe('Add 3 calendars');
  });
});

describe('account formatting', () => {
  test('ago text, the checked line and status pills', () => {
    expect(agoText(T0, T0 - 30_000)).toBe('just now');
    expect(agoText(T0, T0 - 5 * 60_000)).toBe('5 min ago');
    expect(agoText(T0, T0 - 3 * 3_600_000)).toBe('3 h ago');
    expect(checkedLine(GMAIL_CONNECTED, T0)).toBe('Checked 5 min ago');
    expect(checkedLine({ lastSyncAt: undefined, status: 'connected' }, T0)).toBe(G5_UI_COPY.notCheckedYet);
    expect(statusPill('needs_reconnect')).toEqual({ text: G5_COPY.accountNeedsReconnect, tone: 'warn' });
    expect(statusPill('error').tone).toBe('danger');
    expect(statusPill('connected').tone).toBe('ok');
  });
  test('mail dates are the family’s local date, formatted as-is', () => {
    expect(whenText('2026-11-06')).toBe('Fri, Nov 6');
    expect(whenText('2026-11-03T15:30')).toBe('Tue, Nov 3 · 3:30 PM');
    expect(whenText('garbage')).toBe('');
    expect(mailRow(MAIL_ITEMS[0])).toEqual({ title: 'Picture day', sub: 'Fri, Nov 6 · From the school office' });
    expect(reconnectWhat(['gmail'])).toBe(G5_UI_COPY.reconnectWhatGmail);
  });
});
