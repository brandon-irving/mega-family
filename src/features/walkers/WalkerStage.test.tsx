// Regression (found live on web, Oct 28): when a MEGA poked or dipped a ledge, the stage's context value
// changed, every <Ledge>'s cleanup re-ran and unregistered itself, and all the MEGAs stopped dead waiting for
// ledges that were never measured again. A ledge must only unregister when it unmounts.
import { renderWithTheme } from '@/test/renderWithTheme';
import { ThemeProvider } from '@/ui/theme';
import { Ledge, WalkerStageContext, type StageCtx } from './WalkerStage';

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
