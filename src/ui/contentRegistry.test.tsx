// Owner, Oct 28: "Megas should never be covering content". On a walker stage every Text, Button and pixel
// picture registers its rect as content automatically (so no screen can forget one); the walkers' own
// sprites and bubbles (under NoContentRegistry) don't.
import { fireEvent } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Button } from './Button';
import { ContentRegistryProvider, NoContentRegistry, type ContentRegistry } from './contentRegistry';
import { MegaSprite } from './MegaSprite';
import { Text } from './Text';

const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 20 } } };

function fakeRegistry(): ContentRegistry & { register: jest.Mock; unregister: jest.Mock } {
  return { register: jest.fn(), unregister: jest.fn() };
}

describe('content registry', () => {
  test('Text on a stage registers itself as content when laid out', async () => {
    const reg = fakeRegistry();
    const view = await renderWithTheme(
      <ContentRegistryProvider value={reg}>
        <Text testID="words">Join the family</Text>
      </ContentRegistryProvider>,
    );
    await fireEvent(view.getByTestId('words'), 'layout', layout);
    expect(reg.register).toHaveBeenCalledTimes(1);
  });

  test('a Button on a stage registers its whole body as content', async () => {
    const reg = fakeRegistry();
    const view = await renderWithTheme(
      <ContentRegistryProvider value={reg}>
        <Button label="Continue" testID="cont" onPress={() => {}} />
      </ContentRegistryProvider>,
    );
    await fireEvent(view.getByTestId('cont'), 'layout', layout);
    expect(reg.register).toHaveBeenCalled();
  });

  test('a MEGA picture on a stage (Hub, an invite card) registers as content', async () => {
    const reg = fakeRegistry();
    const view = await renderWithTheme(
      <ContentRegistryProvider value={reg}>
        <MegaSprite hex="#2FB8B0" sticker="none" accessibilityLabel="Hub" />
      </ContentRegistryProvider>,
    );
    // fireEvent bubbles up from the picture to the registering wrapper View around it.
    await fireEvent(view.getByLabelText('Hub'), 'layout', layout);
    expect(reg.register).toHaveBeenCalled();
  });

  test("the walkers' own layer never registers (a MEGA can't block itself)", async () => {
    const reg = fakeRegistry();
    const view = await renderWithTheme(
      <ContentRegistryProvider value={reg}>
        <NoContentRegistry>
          <Text testID="bubble">Hi! I’m Teal.</Text>
        </NoContentRegistry>
      </ContentRegistryProvider>,
    );
    await fireEvent(view.getByTestId('bubble'), 'layout', layout);
    expect(reg.register).not.toHaveBeenCalled();
  });

  test('off a stage nothing registers and a caller’s own onLayout still runs', async () => {
    const onLayout = jest.fn();
    const view = await renderWithTheme(
      <Text testID="plain" onLayout={onLayout}>
        Hello
      </Text>,
    );
    await fireEvent(view.getByTestId('plain'), 'layout', layout);
    expect(onLayout).toHaveBeenCalled();
  });

  test('unmounting unregisters the content', async () => {
    const reg = fakeRegistry();
    const view = await renderWithTheme(
      <ContentRegistryProvider value={reg}>
        <Text>Bye</Text>
      </ContentRegistryProvider>,
    );
    await view.unmount();
    expect(reg.unregister).toHaveBeenCalled();
  });
});
