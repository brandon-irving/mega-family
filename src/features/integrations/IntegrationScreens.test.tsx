// Screen 14 pages and sheets: Places / PlacesKid / PlaceSheet, SearchLog (a kid's searches for parents) and
// EventPlace, plus the shared ModalSheet's ways out and the source-link guard.
import { fireEvent, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BUTTON_SIZES } from '@shared/config/theme';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CAL_MEMBERS, IDS, THURSDAY_EVENTS, WEEK_START } from '@/test/gdFixtures';
import { PLACES_FIXTURE, SEARCH_LOG_FIXTURE, T0, TZ } from '@/test/g4Fixtures';
import { CalendarContent } from '@/features/family/CalendarContent';
import { FamilyContent } from '@/features/family/FamilyContent';
import { ModalSheet } from '@/ui/ModalSheet';
import { Text } from '@/ui/Text';
import { isOpenableUrl, domainOf } from '@/services/openLink';
import { EventPlaceSheet } from './EventPlaceSheet';
import { PlacesContent, PlaceSheet } from './PlacesContent';
import { SearchLogContent, whenLabel } from './SearchLogContent';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const noop = () => {};
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const renderScreen = (ui: ReactElement, opts?: { role?: 'kid' | 'adult' }) => renderWithTheme(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>, opts);

describe('Places (boards Places / PlacesKid)', () => {
  test('adults see every place with its map status, Edit on each, and Add a place', async () => {
    const onEdit = jest.fn();
    const onAdd = jest.fn();
    await renderScreen(<PlacesContent places={PLACES_FIXTURE} canEdit onAdd={onAdd} onEdit={onEdit} />);
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('200 Central Park West, New York')).toBeTruthy();
    expect(screen.getAllByText('Found on the map')).toHaveLength(3);
    expect(screen.getByText('Couldn’t find it · check the address')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Edit School'));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ label: 'School' }));
    await fireEvent.press(screen.getByLabelText('Add a place'));
    expect(onAdd).toHaveBeenCalled();
    expect(screen.getByText(/never your phone’s location/)).toBeTruthy();
  });

  test('kids see the same list read-only: no Edit, no Add, "Set by a grown-up"', async () => {
    await renderScreen(<PlacesContent places={PLACES_FIXTURE} canEdit={false} onAdd={noop} onEdit={noop} />, { role: 'kid' });
    expect(screen.getByText('Riverside Park Field')).toBeTruthy();
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByLabelText('Add a place')).toBeNull();
    expect(screen.getByText('Set by a grown-up')).toBeTruthy();
  });

  test('no places yet: adults are told to add home first (never a blank page)', async () => {
    await renderScreen(<PlacesContent places={[]} canEdit onAdd={noop} onEdit={noop} />);
    expect(screen.getByText(/Add home first/)).toBeTruthy();
  });

  test('Family shows a Places link next to Calendar', async () => {
    const onOpenPlaces = jest.fn();
    await renderScreen(<FamilyContent members={[]} comingUp={[]} onOpenMember={noop} onOpenCalendar={noop} onOpenPlaces={onOpenPlaces} />);
    await fireEvent.press(screen.getByLabelText('Open family places'));
    expect(onOpenPlaces).toHaveBeenCalled();
  });
});

describe('PlaceSheet (board PlaceSheet)', () => {
  test('editing: prefilled name, kind and address; Save sends the edit; Remove removes', async () => {
    const onSave = jest.fn();
    const onRemove = jest.fn();
    await renderScreen(<PlaceSheet open place={PLACES_FIXTURE[1]} hasHome onSave={onSave} onRemove={onRemove} onClose={noop} />);
    expect(screen.getByText('Edit place')).toBeTruthy();
    expect(screen.getByLabelText('Name').props.value).toBe('School');
    expect(screen.getByLabelText('School').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(screen.queryByLabelText('Home')).toBeNull(); // the family already has a Home
    await fireEvent.changeText(screen.getByLabelText('Address'), '1 Library Way');
    await fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({ kind: 'school', label: 'School', address: '1 Library Way' });
    await fireEvent.press(screen.getByText('Remove'));
    expect(onRemove).toHaveBeenCalled();
  });

  test('adding: a missing address is caught before saving', async () => {
    const onSave = jest.fn();
    await renderScreen(<PlaceSheet open place={null} hasHome onSave={onSave} onRemove={noop} onClose={noop} />);
    expect(screen.getByText('Add a place')).toBeTruthy();
    expect(screen.queryByText('Remove')).toBeNull();
    await fireEvent.press(screen.getByText('Save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Add an address so MEGA can find it.')).toBeTruthy();
  });

  test('changing the kind updates a default name but keeps a typed one', async () => {
    const onSave = jest.fn();
    await renderScreen(<PlaceSheet open place={null} hasHome onSave={onSave} onRemove={noop} onClose={noop} />);
    await fireEvent.press(screen.getByLabelText('Work'));
    expect(screen.getByLabelText('Name').props.value).toBe('Work');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Grandma’s');
    await fireEvent.press(screen.getByLabelText('Other'));
    expect(screen.getByLabelText('Name').props.value).toBe('Grandma’s');
  });

  test('the sheet has a visible Close control', async () => {
    const onClose = jest.fn();
    await renderScreen(<PlaceSheet open place={null} hasHome={false} onSave={noop} onRemove={noop} onClose={onClose} />);
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ModalSheet: every way out closes it', () => {
  const render = (onClose: () => void) =>
    renderScreen(
      <ModalSheet open title="Edit place" closeLabel="Close" onClose={onClose} testID="sheet">
        <Text>Body</Text>
      </ModalSheet>,
    );

  test('the Close button (≥44pt), the scrim, and Android back / web Escape (onRequestClose)', async () => {
    const onClose = jest.fn();
    await render(onClose);
    const close = screen.getByLabelText('Close'); // the scrim is hidden from screen readers by the modal panel
    expect(close.props.style.width).toBeGreaterThanOrEqual(44);
    await fireEvent.press(close);
    await fireEvent.press(screen.getByTestId('sheet-scrim', { includeHiddenElements: true }));
    // Android back and web Escape both reach RN Modal's onRequestClose.
    await fireEvent(screen.getByText('Body'), 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('A kid’s searches (board SearchLog)', () => {
  test('on: the switch, blocked and changed rows with what happened, newest first', async () => {
    await renderScreen(<SearchLogContent kidName="Twin 1" on onToggle={noop} rows={SEARCH_LOG_FIXTURE} tz={TZ} now={T0 + 60_000} />);
    const toggle = screen.getByLabelText('Tell me about blocked searches');
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(screen.getByText('Blocked')).toBeTruthy();
    expect(screen.getByText('Changed')).toBeTruthy();
    expect(screen.getByText(/Twin 1 saw “I can't look that up/)).toBeTruthy();
    expect(screen.getByText('Searched instead: “Which animals are the most dangerous, for kids”.')).toBeTruthy();
    expect(screen.getByText('Today · 2:00 PM')).toBeTruthy();
    expect(screen.getByText('Yesterday · 6:00 PM')).toBeTruthy();
  });

  test('answered searches are never listed, even if the server sent one', async () => {
    const answered = { ...SEARCH_LOG_FIXTURE[0], _id: 'sl_ok' as never, query: 'how far is the moon', outcome: 'answered' as const };
    await renderScreen(<SearchLogContent kidName="Twin 1" on onToggle={noop} rows={[answered]} tz={TZ} now={T0} />);
    expect(screen.queryByText('“how far is the moon”')).toBeNull();
    expect(screen.getByText(/Nothing blocked or changed yet/)).toBeTruthy();
  });

  test('off: no rows, says what turning it on shows; tapping turns it on', async () => {
    const onToggle = jest.fn();
    await renderScreen(<SearchLogContent kidName="Twin 1" on={false} onToggle={onToggle} rows={null} tz={TZ} now={T0} />);
    expect(screen.getByText(/Turn this on to see the searches/)).toBeTruthy();
    expect(screen.queryByText('Blocked')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Tell me about blocked searches'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  test('whenLabel uses the family’s day, not the device’s', () => {
    expect(whenLabel(T0 - 3 * 24 * 60 * 60 * 1000, T0, TZ)).toBe('Mon · 2:00 PM');
  });
});

describe('Event place (board EventPlace)', () => {
  const event = { title: 'Soccer practice', when: 'Thu 4:30 PM', layer: 'Household', placeId: null, place: 'Riverside Park' };

  test('pick a saved place and Save sends its id; "Type a place instead" clears it', async () => {
    const onSave = jest.fn();
    await renderScreen(<EventPlaceSheet open event={event} places={PLACES_FIXTURE} onSave={onSave} onClose={noop} />);
    expect(screen.getByText('Soccer practice')).toBeTruthy();
    expect(screen.getByLabelText('Type a place instead').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    await fireEvent.press(screen.getByLabelText('School'));
    await fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenLastCalledWith('pl_school');
    await fireEvent.press(screen.getByLabelText('Type a place instead'));
    await fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenLastCalledWith(null);
  });

  test('place rows are at least the button height', async () => {
    await renderScreen(<EventPlaceSheet open event={event} places={PLACES_FIXTURE} onSave={noop} onClose={noop} />);
    expect(screen.getByLabelText('Home').props.style.minHeight).toBeGreaterThanOrEqual(BUTTON_SIZES.adult.height);
  });

  test('the calendar opens an event’s place picker and shows a saved place’s name', async () => {
    const onOpenEvent = jest.fn();
    const soccer = THURSDAY_EVENTS.find((e) => e.title === 'Soccer practice')!;
    const events = THURSDAY_EVENTS.map((e) => (e._id === soccer._id ? { ...e, placeId: 'pl_park' as never } : e));
    await renderScreen(
      <CalendarContent weekStart={WEEK_START} todayIndex={4} events={events} members={CAL_MEMBERS} viewerId={IDS.admin} hubName="Hub" onOpenEvent={onOpenEvent} placeLabels={{ pl_park: 'Riverside Park Field' }} />,
    );
    await fireEvent.press(screen.getByLabelText('Soccer practice, Riverside Park Field'));
    expect(onOpenEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Soccer practice' }));
  });
});

describe('Source links (untrusted search results)', () => {
  test('only http(s) links open', () => {
    expect(isOpenableUrl('https://www.amnh.org/hours')).toBe(true);
    expect(isOpenableUrl('javascript:alert(1)')).toBe(false);
    expect(isOpenableUrl('intent://evil')).toBe(false);
    expect(isOpenableUrl('not a url')).toBe(false);
    expect(domainOf('https://www.amnh.org/hours')).toBe('amnh.org');
  });
});
