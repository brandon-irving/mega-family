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

  test('typing mode: a full-width 72pt field at 20px that shrinks to fit, a round mic to go back, nothing else on the bar', async () => {
    await renderWithTheme(<Composer megaName="Sunny" bigTalkButton onSend={noop} onOpenTalk={noop} onAttach={noop} />, { role: 'kid' });
    await fireEvent.press(screen.getByLabelText('Type instead'));
    const field = screen.getByLabelText('Message Sunny');
    expect(styleOf(field)).toMatchObject({ flex: 1, minWidth: 0, height: K.height, fontSize: K.fontSize });
    expect(field.props.placeholder).toBe('Type to Sunny…');
    expect(screen.queryByText('Back to Talk')).toBeNull();
    const back = screen.getByLabelText('Talk instead');
    expect(styleOf(back).width).toBe(K.height);
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
  test('keeps attach, the field and the mic', async () => {
    await renderWithTheme(<Composer megaName="Teal" onSend={noop} onOpenTalk={noop} onAttach={noop} />);
    expect(screen.getByLabelText('Attach')).toBeTruthy();
    expect(screen.getByLabelText('Message Teal')).toBeTruthy();
    expect(screen.getByLabelText('Talk')).toBeTruthy();
  });
});

// GD UX review LOW: the adult placeholder "Message Teal… (@ to mention)" was cut off mid-word at 390pt.
// A placeholder can't ellipsize on web, so it stays short enough to fit beside the buttons.
describe('Composer (adult bar)', () => {
  test('the placeholder is short and never cut off mid-word', async () => {
    await renderWithTheme(<Composer megaName="Pebble" bigTalkButton={false} onSend={noop} onOpenTalk={noop} onAttach={noop} />, { role: 'adult' });
    const field = screen.getByLabelText('Message Pebble');
    expect(field.props.placeholder).toBe('Message Pebble…');
    expect(field.props.numberOfLines ?? 1).toBe(1);
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
      fireEvent(screen.getByLabelText('Message Teal'), 'submitEditing');
    });
    expect(onSend).toHaveBeenCalledWith('call me Admin');
  });
});

describe('owner, Oct 29 (Images 26/28): the grown-up composer bar has no background of its own', () => {
  test('the bar is transparent with no top border; the text field carries the fill so it reads over the thread', async () => {
    await renderWithTheme(<Composer megaName="Teal" onSend={noop} onOpenTalk={noop} />);
    const bar = styleOf(screen.getByTestId('composer-bar'));
    expect(bar.backgroundColor).toBeUndefined();
    expect(bar.borderTopWidth).toBeUndefined();
    const field = styleOf(screen.getByPlaceholderText(/Teal/));
    expect(field.backgroundColor).toBeDefined();
  });
});
