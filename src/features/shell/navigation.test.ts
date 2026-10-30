import { router as nativeRouter } from 'expo-router';
import { router, resetNavigationGuard } from './navigation';
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(), canDismiss: jest.fn(), dismissAll: jest.fn() } }));
beforeEach(() => { jest.clearAllMocks(); resetNavigationGuard(); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());
test('rapid duplicate opens create one route; a different child can still open', () => {
  router.push('/today'); router.push('/today'); router.push('/family/calendar');
  expect(nativeRouter.push).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(700); router.push('/today');
  expect(nativeRouter.push).toHaveBeenCalledTimes(3);
});
test('double close pops one screen and cold-entry close uses a safe fallback', () => {
  (nativeRouter.canGoBack as jest.Mock).mockReturnValue(true);
  router.back(); router.back(); expect(nativeRouter.back).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(700); (nativeRouter.canGoBack as jest.Mock).mockReturnValue(false);
  router.back(); expect(nativeRouter.replace).toHaveBeenCalledWith('/chat');
});
test('Message dismisses the root modal then selects Chat', () => {
  (nativeRouter.canDismiss as jest.Mock).mockReturnValue(true);
  router.toTab('/chat');
  expect(nativeRouter.dismissAll).toHaveBeenCalledTimes(1);
  expect(nativeRouter.navigate).toHaveBeenCalledWith('/chat');
  expect((nativeRouter.dismissAll as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((nativeRouter.navigate as jest.Mock).mock.invocationCallOrder[0]);
});
