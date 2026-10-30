// `useProducts`: product details are read live (`shopping.products` action) and never stored. One call per ref
// set, a refused call becomes a calm failure state, nothing is called for no refs, and a remount with the same
// refs shows the last answer at once (in memory only; cleared on sign-out with the rest of queryMemory).
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { SHOPPING } from '@shared/config/shopping';
import { PRODUCT_KIT, PRODUCTS_NOT_SET_UP } from '@/test/g4bFixtures';
import { clearQueryMemory } from './queryMemory';
import { productMatches, useProducts } from './useShopping';

const mockLookup = jest.fn();
jest.mock('convex/react', () => ({ ...jest.requireActual('convex/react'), useAction: () => mockLookup }));

const REF = { productId: PRODUCT_KIT.productId, variantId: PRODUCT_KIT.variantId };

beforeEach(() => {
  mockLookup.mockReset();
  clearQueryMemory();
});

test('loading while the store answers', async () => {
  mockLookup.mockReturnValue(new Promise(() => {}));
  const { result } = await renderHook(() => useProducts([REF]));
  expect(result.current).toEqual({ status: 'loading' });
});

test('then the products; one call for the ref set', async () => {
  mockLookup.mockResolvedValue({ products: [PRODUCT_KIT] });
  const refs = [REF];
  const { result } = await renderHook(() => useProducts(refs));
  await waitFor(() => expect(result.current).toEqual({ status: 'ok', products: [PRODUCT_KIT] }));
  expect(mockLookup).toHaveBeenCalledTimes(1);
  expect(mockLookup).toHaveBeenCalledWith({ refs: [REF] });
});

test('no refs: no call, and an empty answer at once', async () => {
  const { result } = await renderHook(() => useProducts([]));
  expect(result.current).toEqual({ status: 'ok', products: [] });
  expect(mockLookup).not.toHaveBeenCalled();
});

test('the catalog’s failure, and a refused call, become failure states (never a throw into render)', async () => {
  mockLookup.mockResolvedValueOnce(PRODUCTS_NOT_SET_UP);
  const a = await renderHook(() => useProducts([REF]));
  await waitFor(() => expect(a.result.current).toEqual({ status: 'failure', failure: 'not_configured' }));
  mockLookup.mockRejectedValueOnce(new Error('FORBIDDEN'));
  const b = await renderHook(() => useProducts([{ productId: 'other' }]));
  await waitFor(() => expect(b.result.current).toEqual({ status: 'failure', failure: 'refused' }));
});

test('refs past SHOPPING.maxLookup are dropped, not sent', async () => {
  mockLookup.mockResolvedValue({ products: [] });
  const many = Array.from({ length: SHOPPING.maxLookup + 3 }, (_, i) => ({ productId: `p${i}` }));
  await renderHook(() => useProducts(many));
  await waitFor(() => expect(mockLookup).toHaveBeenCalled());
  expect(mockLookup.mock.calls[0][0].refs).toHaveLength(SHOPPING.maxLookup);
});

test('a remount with the same refs shows the last answer at once', async () => {
  mockLookup.mockResolvedValue({ products: [PRODUCT_KIT] });
  const first = await renderHook(() => useProducts([REF]));
  await waitFor(() => expect(first.result.current.status).toBe('ok'));
  await first.unmount();
  const again = await renderHook(() => useProducts([REF]));
  expect(again.result.current).toEqual({ status: 'ok', products: [PRODUCT_KIT] });
});

test('a lookup that finishes after unmount cannot repopulate cleared session memory', async () => {
  let resolveLookup!: (value: { products: (typeof PRODUCT_KIT)[] }) => void;
  mockLookup.mockReturnValueOnce(new Promise((resolve) => { resolveLookup = resolve; }));
  const first = await renderHook(() => useProducts([REF]));
  await first.unmount();
  clearQueryMemory();

  await act(async () => resolveLookup({ products: [PRODUCT_KIT] }));
  mockLookup.mockReturnValue(new Promise(() => {}));
  const nextSession = await renderHook(() => useProducts([REF]));
  expect(nextSession.result.current).toEqual({ status: 'loading' });
});

test('a ref with a variant matches only that variant', () => {
  expect(productMatches(REF, PRODUCT_KIT)).toBe(true);
  expect(productMatches(REF, { ...PRODUCT_KIT, variantId: 'gid://shopify/ProductVariant/other' })).toBe(false);
  expect(productMatches({ productId: PRODUCT_KIT.productId }, PRODUCT_KIT)).toBe(true);
});
