// Owner, Oct 28 (Images 14–15): the kid composer's keyboard toggle was a tiny "⌨" character, and typing
// mode ran off the screen ("Back to T…" cut off). Kids get one bar on every screen (canvas v33,
// design/build/thread.html "Kid composer"): a 72pt Talk pill + a 72pt round keyboard toggle with a drawn
// 28px icon; typing swaps in a full-width 72pt field (20px text) + a round mic to go back.
import { fireEvent, screen } from '@testing-library/react-native';
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
