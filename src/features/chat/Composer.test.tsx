// Owner, Oct 28 (Images 14–15): the kid composer's keyboard toggle was a tiny "⌨" character, and typing
// mode ran off the screen ("Back to T…" cut off). Kids get one bar on every screen (canvas v33,
// design/build/thread.html "Kid composer"): a 72pt Talk pill + a 72pt round keyboard toggle with a drawn
// 28px icon; typing swaps in a full-width 72pt field (20px text) + a round mic to go back.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { COMPOSER_SIZES } from '@shared/config/theme';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Composer } from './Composer';

const noop = () => {};
const K = COMPOSER_SIZES.kid;
const styleOf = (el: { props: Record<string, unknown> }) => Object.assign({}, ...([el.props.style].flat(3).filter(Boolean) as object[])) as Record<string, unknown>;

describe('Composer (kid bar)', () => {
  test('talk mode: a 72pt Talk pill and a 72pt round keyboard toggle with a drawn icon (no tiny ⌨ character)', async () => {
    await renderWithTheme(<Composer megaName="Sunny" bigTalkButton onSend={noop} onOpenTalk={noop} />, { role: 'kid' });
    expect(styleOf(screen.getByLabelText('Talk to Sunny')).minHeight).toBe(K.height);
    const toggle = screen.getByLabelText('Type instead');
    expect(styleOf(toggle).width).toBe(K.height);
    expect(styleOf(toggle).height).toBe(K.height);
    // The icon is hidden from screen readers (the button carries the label), so include hidden elements.
    const icon = screen.getByTestId('keyboard-icon', { includeHiddenElements: true });
    expect(Number(icon.props.width ?? styleOf(icon).width)).toBe(K.toggleIcon);
    expect(screen.queryByText('⌨')).toBeNull();
  });

  test('typing mode: the shared growing field and a mic to return to Talk', async () => {
    await renderWithTheme(<Composer megaName="Sunny" bigTalkButton onSend={noop} onOpenTalk={noop} />, { role: 'kid' });
    await fireEvent.press(screen.getByLabelText('Type instead'));
    const field = screen.getByLabelText('Message Sunny');
    expect(styleOf(field)).toMatchObject({ minWidth: 0 });
    expect(field.props.multiline).toBe(true);
    expect(field.props.placeholder).toBe('Type to Sunny…');
    expect(screen.queryByText('Back to Talk')).toBeNull();
    const back = screen.getByLabelText('Talk instead');
    expect(styleOf(back).width).toBeGreaterThanOrEqual(44);
    expect(screen.queryByLabelText('Attach')).toBeNull();
    await fireEvent.press(back);
    expect(screen.getByLabelText('Talk to Sunny')).toBeTruthy();
  });

  test('typing mode: once there is text, the round button sends it', async () => {
    const onSend = jest.fn();
    await renderWithTheme(<Composer megaName="Sunny" bigTalkButton onSend={onSend} onOpenTalk={noop} />, { role: 'kid' });
    await fireEvent.press(screen.getByLabelText('Type instead'));
    await fireEvent.changeText(screen.getByLabelText('Message Sunny'), 'hi Sunny');
    await fireEvent.press(screen.getByLabelText('Send message'));
    expect(onSend).toHaveBeenCalledWith('hi Sunny');
  });
});

describe('Composer (adult bar)', () => {
  test('contains only working actions and keeps the field full-width when Send replaces Talk', async () => {
    const onSend = jest.fn();
    const onTalk = jest.fn();
    const onCamera = jest.fn();
    await renderWithTheme(<Composer megaName="Teal" onSend={onSend} onOpenTalk={onTalk} onCamera={onCamera} cameraLabel="Snap homework" />);
    expect(screen.queryByLabelText('Attach')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Talk'));
    expect(onTalk).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Add attachment'));
    expect(onCamera).toHaveBeenCalledTimes(1);
    const field = screen.getByLabelText('Message Teal');
    expect(field.props.multiline).toBe(true);
    expect(field.props.submitBehavior).toBe('newline');
    const widthBeforeTyping = styleOf(field).width;
    await fireEvent.changeText(field, '  A meal idea\nfor tomorrow  ');
    expect(styleOf(screen.getByLabelText('Message Teal')).width).toBe(widthBeforeTyping);
    expect(screen.queryByLabelText('Talk')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Send message'));
    expect(onSend).toHaveBeenCalledWith('A meal idea\nfor tomorrow');
    expect(screen.getByLabelText('Message Teal').props.value).toBe('');
    expect(screen.getByLabelText('Talk')).toBeTruthy();
  });

  test('without a camera callback no camera or attach affordance is shown, and whitespace cannot send', async () => {
    await renderWithTheme(<Composer megaName="Teal" onSend={noop} onOpenTalk={noop} />);
    expect(screen.queryByLabelText('Take a photo')).toBeNull();
    expect(screen.queryByLabelText('Attach')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Message Teal'), '   ');
    expect(screen.queryByLabelText('Send message')).toBeNull();
    expect(screen.getByLabelText('Talk')).toBeTruthy();
  });
});

describe('Composer (G5 onboarding, board OnboardChat)', () => {
  test('while the onboarding step is `name`, the field asks "What should I call you?" and sends the answer', async () => {
    const onSend = jest.fn();
    await renderWithTheme(<Composer megaName="Teal" onSend={onSend} onOpenTalk={noop} placeholder="What should I call you?" />);
    const field = screen.getByLabelText('Message Teal');
    expect(field.props.placeholder).toBe('What should I call you?');
    await act(async () => {
      fireEvent.changeText(field, 'call me Admin');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send message'));
    });
    expect(onSend).toHaveBeenCalledWith('call me Admin');
  });
});

describe('owner, Oct 29 (Images 26/28): the grown-up composer bar has no background of its own', () => {
  test('the bar stays transparent while the shared composer surface contains the field and actions', async () => {
    await renderWithTheme(<Composer megaName="Teal" onSend={noop} onOpenTalk={noop} />);
    const bar = styleOf(screen.getByTestId('composer-bar'));
    expect(bar.backgroundColor).toBeUndefined();
    expect(bar.borderTopWidth).toBeUndefined();
    expect(styleOf(screen.getByTestId('composer-surface')).backgroundColor).toBeDefined();
  });
});

test('wrapped content grows to a cap, then scrolls; sending resets the height', async () => {
  await renderWithTheme(<Composer megaName="Teal" onSend={noop} onOpenTalk={noop} />);
  const field = () => screen.getByLabelText('Message Teal');
  const initial = styleOf(field()).height as number;
  await fireEvent(field(), 'contentSizeChange', { nativeEvent: { contentSize: { height: initial + 30 } } });
  expect(styleOf(field()).height).toBe(initial + 30);
  await fireEvent(field(), 'contentSizeChange', { nativeEvent: { contentSize: { height: 1000 } } });
  expect(styleOf(field()).height).toBeLessThan(1000);
  expect(field().props.scrollEnabled).toBe(true);
  await fireEvent.changeText(field(), 'A message');
  await fireEvent.press(screen.getByLabelText('Send message'));
  expect(styleOf(field()).height).toBe(initial);
});
