// Screen 12 boards: the calendar's layers (Calendar / CalPartner), share suggestion (CalShare), clash
// proposal (CalClash / CalClashDone) and gift ideas (CalGifts).
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CAL_MEMBERS, GIFTS_READY, IDS, PROPOSAL_PENDING, THURSDAY_EVENTS, WEEK_START } from '@/test/gdFixtures';
import { CalendarContent } from '@/features/family/CalendarContent';
import { GiftsCardView } from './GiftsCard';
import { ProposalCardView } from './ProposalCard';
import { ShareSuggestionView } from './ShareSuggestionCard';

const noop = () => {};
const adminDir = { me: { id: IDS.admin, name: 'Admin', role: 'admin' as const, isAdult: true, isAdmin: true, parentOf: [] }, nameOf: (id: string | undefined) => ({ [IDS.partner]: 'Partner', [IDS.admin]: 'Admin' })[id ?? ''] ?? '' };
const partnerDir = { ...adminDir, me: { ...adminDir.me, id: IDS.partner, name: 'Partner', role: 'adult' as const, isAdmin: false } };

describe('CalendarContent layers (boards Calendar / CalPartner)', () => {
  const render = (extra: Partial<Parameters<typeof CalendarContent>[0]> = {}) =>
    renderWithTheme(<CalendarContent weekStart={WEEK_START} todayIndex={4} events={THURSDAY_EVENTS} members={CAL_MEMBERS} viewerId={IDS.admin} hubName="Hub" {...extra} />);

  test('the viewer’s private event is marked Only you; household events say Household', async () => {
    await render();
    expect(screen.getByText('Dentist')).toBeTruthy();
    expect(screen.getByText('You · Only you')).toBeTruthy();
    expect(screen.getByText('Twin 1 · Household')).toBeTruthy();
    expect(screen.getByText('Partner · Household')).toBeTruthy();
  });

  test('turning off "Only you" hides private events; turning off Household hides the rest', async () => {
    await render();
    await fireEvent.press(screen.getByLabelText('Only you'));
    expect(screen.queryByText('Dentist')).toBeNull();
    expect(screen.getByText('Soccer practice')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Household'));
    expect(screen.queryByText('Soccer practice')).toBeNull();
  });

  test('an open clash shows Hub’s banner and tags the event its fix changes', async () => {
    const onSeeClash = jest.fn();
    await render({ clash: { eventIds: ['ev_pickup'], line: 'Partner can’t be at soccer pickup', messageId: 'msg_1' }, onSeeClash });
    expect(screen.getByText('Hub spotted a clash')).toBeTruthy();
    expect(screen.getByText('CLASH')).toBeTruthy();
    await fireEvent.press(screen.getByText('See the fix'));
    expect(onSeeClash).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg_1' }));
  });

  test('a clash tags BOTH household events in it (clashEventIds), never a private one', async () => {
    const dinner = { ...THURSDAY_EVENTS[2], _id: 'ev_dinner', title: 'Work dinner', start: THURSDAY_EVENTS[2].start - 30 * 60 * 1000 } as (typeof THURSDAY_EVENTS)[number];
    await render({ events: [...THURSDAY_EVENTS, dinner], clash: { eventIds: ['ev_pickup', 'ev_dinner'], line: 'Partner can’t be at soccer pickup', messageId: 'msg_1' } });
    expect(screen.getAllByText('CLASH')).toHaveLength(2);
  });

  test('the private-layer note names the family MEGA', async () => {
    await render();
    expect(screen.getByText('Private events stay on your calendar. Nobody else sees them, and Hub never checks them for clashes.')).toBeTruthy();
  });
});

describe('ShareSuggestionView (board CalShare)', () => {
  test('pending: Share it / Keep private, with the share rule under it', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(<ShareSuggestionView megaName="Teal" hubName="Hub" preview="Dentist · Thu 4:00–5:00 PM" status="pending" onAnswer={onAnswer} />);
    expect(screen.getByText('Everyone in the household would see “Dentist · Thu 4:00–5:00 PM”. Right now it’s only on your calendar.')).toBeTruthy();
    expect(screen.getByText('MEGA never shares anything unless you tap Share.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep private'));
    expect(onAnswer).toHaveBeenCalledWith(false);
  });

  test('answered: the buttons are gone and the outcome is stated', async () => {
    await renderWithTheme(<ShareSuggestionView megaName="Teal" hubName="Hub" preview="Dentist" status="kept" onAnswer={noop} />);
    expect(screen.queryByText('Share it')).toBeNull();
    expect(screen.getByText('Kept private. Only you see it.')).toBeTruthy();
  });
});

describe('ProposalCardView (boards CalClash / CalClashDone)', () => {
  test('labeled as AI from Hub, with the disclosure, before/after, and nothing changed yet', async () => {
    await renderWithTheme(<ProposalCardView view={PROPOSAL_PENDING} dir={adminDir} onDecide={noop} />);
    expect(screen.getByText('Hub · your family’s MEGA')).toBeTruthy();
    expect(screen.getByLabelText('Written by AI')).toBeTruthy();
    expect(screen.getByText(/Nothing changes until Admin approves/)).toBeTruthy();
    expect(screen.getByText('Soccer pickup · Partner')).toBeTruthy();
    expect(screen.getByText('Soccer pickup · You')).toBeTruthy();
    expect(screen.getByText('Waiting for Admin (you) to approve. Nothing has changed yet.')).toBeTruthy();
  });

  test('only the Admin gets Approve / Reject', async () => {
    const onDecide = jest.fn();
    await renderWithTheme(<ProposalCardView view={PROPOSAL_PENDING} dir={adminDir} onDecide={onDecide} />);
    await fireEvent.press(screen.getByText('Approve'));
    expect(onDecide).toHaveBeenCalledWith(true);
  });

  test('another adult sees the fix but cannot decide it', async () => {
    await renderWithTheme(<ProposalCardView view={PROPOSAL_PENDING} dir={partnerDir} onDecide={noop} />);
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.getByText('Waiting for Admin to approve. Nothing has changed yet.')).toBeTruthy();
  });

  test('approved: says who approved and drops the buttons', async () => {
    const approved = { ...PROPOSAL_PENDING, proposal: { ...PROPOSAL_PENDING.proposal, status: 'approved' as const, decision: { byId: IDS.admin as never, at: 0, approve: true, audience: [] } } };
    await renderWithTheme(<ProposalCardView view={approved} dir={adminDir} onDecide={noop} />);
    expect(screen.getByText('Approved by Admin. The calendar is updated.')).toBeTruthy();
    expect(screen.queryByText('Approve')).toBeNull();
  });
});

describe('GiftsCardView (board CalGifts)', () => {
  test('tags what the ideas are based on and marks ideas already on the list', async () => {
    const onAdd = jest.fn();
    await renderWithTheme(<GiftsCardView megaName="Teal" forName="Twin 1" gifts={GIFTS_READY} onAdd={onAdd} />);
    expect(screen.getByText('Gift ideas for Twin 1')).toBeTruthy();
    expect(screen.getByText('Twin 1 shared: loves dinosaurs')).toBeTruthy();
    expect(screen.getByLabelText('Added: Dig-your-own fossil kit')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add to list: Dinosaur skeleton building set'));
    expect(onAdd).toHaveBeenCalledWith(0);
    expect(screen.getByText('Only shared info is used. Private notes stay private.')).toBeTruthy();
  });
});
