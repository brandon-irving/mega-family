// Regression (found live on web, Oct 28): when a MEGA poked or dipped a ledge, the stage's context value
// changed, every <Ledge>'s cleanup re-ran and unregistered itself, and all the MEGAs stopped dead waiting for
// ledges that were never measured again. A ledge must only unregister when it unmounts.
import { renderWithTheme } from '@/test/renderWithTheme';
import { ThemeProvider } from '@/ui/theme';
import { fireEvent } from '@testing-library/react-native';
import { Lane, Ledge, Obstacle, WalkerStageContext, type StageCtx } from './WalkerStage';

function fakeStage(over: Partial<StageCtx> = {}): StageCtx {
  return { register: jest.fn(), unregister: jest.fn(), lookAtLedge: jest.fn(), dipped: new Set(), poked: new Set(), ...over };
}

describe('Ledge', () => {
  test('a dip or poke elsewhere on the stage (a new context value) does not unregister the ledge', async () => {
    const base = fakeStage();
    const view = await renderWithTheme(
      <WalkerStageContext.Provider value={base}>
        <Ledge id="make" pressable />
      </WalkerStageContext.Provider>,
    );
    // Same stable callbacks, new dip/poke sets — exactly what the stage provides on each change.
    const next = { ...base, dipped: new Set(['make']), poked: new Set(['signin']) };
    // rerender() replaces the whole tree, so the theme provider renderWithTheme added goes back in by hand.
    await view.rerender(
      <ThemeProvider>
        <WalkerStageContext.Provider value={next}>
          <Ledge id="make" pressable />
        </WalkerStageContext.Provider>
      </ThemeProvider>,
    );
    expect(base.unregister).not.toHaveBeenCalled();
  });

  test('unmounting a ledge unregisters it', async () => {
    const stage = fakeStage();
    const view = await renderWithTheme(
      <WalkerStageContext.Provider value={stage}>
        <Ledge id="make" />
      </WalkerStageContext.Provider>,
    );
    await view.unmount();
    expect(stage.unregister).toHaveBeenCalledWith('make');
  });
});

// Owner, Oct 28: MEGAs never cover content. An <Obstacle> is content nobody stands on; a <Lane> is an empty
// strip MEGAs walk along with no content of its own (feet on its bottom edge).
describe('Obstacle and Lane', () => {
  const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 44 } } };
  test('an Obstacle registers as content only, never as a ledge', async () => {
    const stage = fakeStage();
    const view = await renderWithTheme(
      <WalkerStageContext.Provider value={stage}>
        <Obstacle id="code" testID="obstacle" />
      </WalkerStageContext.Provider>,
    );
    fireEvent(view.getByTestId('obstacle'), 'layout', layout);
    expect(stage.register).toHaveBeenCalledWith('code', expect.anything(), expect.objectContaining({ ledge: false }));
  });

  test('a Lane is a ledge at its bottom edge with no content rect', async () => {
    const stage = fakeStage();
    const view = await renderWithTheme(
      <WalkerStageContext.Provider value={stage}>
        <Lane id="signin" testID="lane" />
      </WalkerStageContext.Provider>,
    );
    fireEvent(view.getByTestId('lane'), 'layout', layout);
    expect(stage.register).toHaveBeenCalledWith('signin', expect.anything(), expect.objectContaining({ obstacle: false, inset: 44 }));
  });
});
