// Screen 10 boards: homework, practice (kid + parent), chores (kid + parent), bedtime, morning, Mega Bucks.
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { BUTTON_SIZES } from '@shared/config/theme';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CHORE_CLAIMED, CHORE_DUE, PRACTICE_DONE, PRACTICE_HINTED, PRACTICE_READY } from '@/test/gdFixtures';
import { BucksMomentView } from './BucksCard';
import { ChoreApproveView, KidChoreView } from './ChoreCard';
import { HomeworkCardView } from './HomeworkCard';
import { MorningRoutineView } from './MorningRoutine';
import { currentQuestionIndex, KidPracticeView, PracticeSummaryView } from './PracticeCard';
import { BedtimeView, bedtimeTitle } from './RoutineCard';

const noop = () => {};

describe('HomeworkCardView (board Kids)', () => {
  test('picks a kid and a question count, then sends both to Make practice', async () => {
    const onMake = jest.fn();
    await renderWithTheme(<HomeworkCardView megaName="Teal" sheet={{ status: 'ready', topic: 'Fractions · Sheet 4' }} kids={[{ id: 't1', label: 'Twin 1' }, { id: 't2', label: 'Twin 2' }]} outcome={null} onMake={onMake} onSkip={noop} />);
    await fireEvent.press(screen.getByLabelText('For: Twin 2'));
    await fireEvent.press(screen.getByLabelText('Questions: 3'));
    await fireEvent.press(screen.getByText('Make practice'));
    expect(onMake).toHaveBeenCalledWith('t2', 3);
  });

  test('after sending, the chips and buttons give way to the status line', async () => {
    await renderWithTheme(<HomeworkCardView megaName="Teal" sheet={{ status: 'ready' }} kids={[{ id: 't1', label: 'Twin 1' }]} outcome={{ kind: 'sent', kidName: 'Twin 1', kidMega: 'Zap' }} onMake={noop} onSkip={noop} />);
    expect(screen.getByText('Sent to Twin 1. Zap starts when they open it.')).toBeTruthy();
    expect(screen.queryByText('Make practice')).toBeNull();
  });

  test('while MEGA is still reading the photo it says so', async () => {
    await renderWithTheme(<HomeworkCardView megaName="Teal" sheet={{ status: 'reading' }} kids={[]} outcome={null} onMake={noop} onSkip={noop} />);
    expect(screen.getByText('Reading the worksheet…')).toBeTruthy();
  });
});

describe('KidPracticeView (boards KidsPractice / KidsHint / KidsDone)', () => {
  test('starts on the first question not yet answered correctly', () => {
    expect(currentQuestionIndex(PRACTICE_READY)).toBe(1);
  });

  test('shows the question, its choices and "Hint, please"; a choice reports its index', async () => {
    const onPick = jest.fn();
    await renderWithTheme(<KidPracticeView view={PRACTICE_READY} megaName="Zap" missIndex={null} onPick={onPick} onHint={noop} />, { role: 'kid' });
    expect(screen.getByText('What is 1/3 + 1/3?')).toBeTruthy();
    expect(screen.getByText('Question 2 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByText('2/3'));
    expect(onPick).toHaveBeenCalledWith('q2', 2);
    expect(screen.getByText('Hint, please')).toBeTruthy();
  });

  test('a wrong pick is marked and asks about a hint; once hinted, the hint shows and the button goes', async () => {
    await renderWithTheme(<KidPracticeView view={PRACTICE_HINTED} megaName="Zap" missIndex={0} onPick={noop} onHint={noop} />, { role: 'kid' });
    expect(screen.getByLabelText('2/6, not quite')).toBeTruthy();
    expect(screen.getByText('Not quite. Look at the hint and try again!')).toBeTruthy();
    expect(screen.getByText('The bottoms already match. What happens to the tops?')).toBeTruthy();
    expect(screen.queryByText('Hint, please')).toBeNull();
  });

  test('a finished set shows the score', async () => {
    await renderWithTheme(<KidPracticeView view={PRACTICE_DONE} megaName="Zap" missIndex={null} onPick={noop} onHint={noop} />, { role: 'kid' });
    expect(screen.getByText('You got 2 of 3!')).toBeTruthy();
    expect(screen.getByText('I told your grown-ups how it went.')).toBeTruthy();
  });

  test('kid action buttons use the kid button size from config', async () => {
    await renderWithTheme(<KidPracticeView view={PRACTICE_READY} megaName="Zap" missIndex={null} onPick={noop} onHint={noop} />, { role: 'kid' });
    const hint = screen.getByLabelText('Hint, please');
    expect(StyleSheet.flatten(hint.props.style)).toEqual(expect.objectContaining({ minHeight: BUTTON_SIZES.kid.height }));
  });
});

describe('PracticeSummaryView (board KidsSummary)', () => {
  test('summary title, the stepper and Release N; the stepper stays within config bounds', async () => {
    const onAmount = jest.fn();
    const onRelease = jest.fn();
    await renderWithTheme(<PracticeSummaryView view={PRACTICE_DONE} kidName="Twin 1" kidMega="Zap" amount={20} onAmount={onAmount} outcome={null} onRelease={onRelease} onLater={noop} />);
    expect(screen.getByText('Twin 1 got 2 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('More'));
    expect(onAmount).not.toHaveBeenCalled(); // 20 is MEGA_BUCKS.maxRelease
    await fireEvent.press(screen.getByLabelText('Fewer'));
    expect(onAmount).toHaveBeenCalledWith(19);
    await fireEvent.press(screen.getByText('Release 20'));
    expect(onRelease).toHaveBeenCalled();
  });

  test('once released, shows who got what and no more buttons', async () => {
    await renderWithTheme(<PracticeSummaryView view={{ ...PRACTICE_DONE, released: { amount: 5, byId: 'a' as never, at: 0 } }} kidName="Twin 1" kidMega="Zap" amount={5} onAmount={noop} outcome={null} onRelease={noop} onLater={noop} />);
    expect(screen.getByText('Released 5 Mega Bucks to Twin 1. Zap told them.')).toBeTruthy();
    expect(screen.queryByText(/^Release /)).toBeNull();
  });

  test('someone who may not release sees the summary without buttons', async () => {
    await renderWithTheme(<PracticeSummaryView view={{ ...PRACTICE_DONE, canRelease: false }} kidName="Twin 1" kidMega="Zap" amount={5} onAmount={noop} outcome={null} onRelease={noop} onLater={noop} />);
    expect(screen.queryByText('Release 5')).toBeNull();
    expect(screen.getByText('Only grown-ups can release Mega Bucks.')).toBeTruthy();
  });
});

describe('chores (boards KidsChore / KidsChoreApprove)', () => {
  test('the kid taps Done!', async () => {
    const onDone = jest.fn();
    await renderWithTheme(<KidChoreView view={CHORE_DUE} megaName="Sunny" onDone={onDone} />, { role: 'kid' });
    expect(screen.getByText('When a grown-up checks, you get 3 Mega Bucks.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Done!'));
    expect(onDone).toHaveBeenCalled();
  });

  test('a claimed chore tells the kid it’s waiting on a grown-up', async () => {
    await renderWithTheme(<KidChoreView view={CHORE_CLAIMED} megaName="Sunny" onDone={noop} />, { role: 'kid' });
    expect(screen.queryByText('Done!')).toBeNull();
    expect(screen.getByText(/I told your grown-ups/)).toBeTruthy();
  });

  test('the parent releases or says Not yet', async () => {
    const onRelease = jest.fn();
    const onDecline = jest.fn();
    await renderWithTheme(<ChoreApproveView view={CHORE_CLAIMED} kidName="Twin 2" kidMega="Sunny" canRelease amount={3} onAmount={noop} onRelease={onRelease} onDecline={onDecline} />);
    expect(screen.getByText('Twin 2 says “Dishes after dinner” is done')).toBeTruthy();
    await fireEvent.press(screen.getByText('Release 3'));
    await fireEvent.press(screen.getByText('Not yet'));
    expect(onRelease).toHaveBeenCalled();
    expect(onDecline).toHaveBeenCalled();
  });
});

describe('routines (boards KidsBedtime / KidsMorning)', () => {
  test('bedtime counts packed items and toggles one', async () => {
    const onToggle = jest.fn();
    const steps = [
      { id: 'cleats', label: 'Cleats', detail: 'In your closet', done: true },
      { id: 'bottle', label: 'Water bottle', done: false },
    ];
    await renderWithTheme(<BedtimeView megaName="Zap" steps={steps} onToggle={onToggle} />, { role: 'kid' });
    expect(screen.getByText('Pack your bag tonight so the morning is easy. 1 of 2 packed.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Water bottle'));
    expect(onToggle).toHaveBeenCalledWith('bottle', true);
  });

  test('bedtime title names tomorrow’s calendar event (board: "Soccer practice at 4:30"), else the generic line', async () => {
    expect(bedtimeTitle([{ id: 'a', label: 'Cleats', done: false, source: { eventId: 'ev1', title: 'Soccer practice' } }])).toBe('Soccer practice tomorrow');
    const plain: { id: string; label: string; done: boolean; source?: { title?: string } }[] = [{ id: 'a', label: 'Cleats', done: false }];
    expect(bedtimeTitle(plain)).toBe('Get ready for tomorrow');
    await renderWithTheme(<BedtimeView megaName="Zap" title="Soccer practice tomorrow" steps={[{ id: 'a', label: 'Cleats', done: false }]} onToggle={noop} />, { role: 'kid' });
    expect(screen.getByText('Soccer practice tomorrow')).toBeTruthy();
  });

  const morningSteps = [
    { id: 'dressed', label: 'Get dressed', done: true },
    { id: 'teeth', label: 'Brush your teeth', detail: 'Two whole minutes.', done: false },
  ];

  test('morning: Done! checks the current step', async () => {
    const onDone = jest.fn();
    await renderWithTheme(<MorningRoutineView kidName="Twin 1" mega={{ hex: '#8E6CE0', sticker: 'bolt' }} steps={morningSteps} dateLine="Monday" onDone={onDone} onStartOver={noop} />, { role: 'kid' });
    expect(screen.getByText('Step 2 of 2')).toBeTruthy();
    await fireEvent.press(screen.getByText('Done!'));
    expect(onDone).toHaveBeenCalledWith('teeth');
  });

  test('morning: all done shows the finish', async () => {
    await renderWithTheme(<MorningRoutineView kidName="Twin 1" mega={{ hex: '#8E6CE0', sticker: 'bolt' }} steps={morningSteps.map((s) => ({ ...s, done: true }))} dateLine="Monday" onDone={noop} onStartOver={noop} />, { role: 'kid' });
    expect(screen.getByText('All set, Twin 1!')).toBeTruthy();
    expect(screen.getByText('Start over')).toBeTruthy();
  });
});

describe('BucksMomentView (board KidsBucks)', () => {
  test('shows the amount, who released it, the balance, and folds on Later', async () => {
    const onOpenStore = jest.fn();
    await renderWithTheme(<BucksMomentView by="Admin" amount={5} sourceKind="practice" balance={12} onOpenStore={onOpenStore} />, { role: 'kid' });
    expect(screen.getByText('+5')).toBeTruthy();
    expect(screen.getByText('You have 12 Mega Bucks')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open the Store'));
    expect(onOpenStore).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Later'));
    expect(screen.queryByText('+5')).toBeNull();
    expect(screen.getByText('Admin released 5 Mega Bucks!')).toBeTruthy();
  });
});
