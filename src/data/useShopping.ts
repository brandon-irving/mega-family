// G4b (CONTRACT v0.16): products read live from the store catalog, price watches and holiday questions.
// Product details are never stored (Shopify's catalog terms forbid caching results): `shopping.products` is an
// action the card calls when it mounts. The last answer per ref set is kept only in memory (queryMemory, cleared
// whenever the signed-in session changes) so a card remounting with Chat doesn't flash its loading rows again.
import { useEffect, useMemo, useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import type { Product, ProductRef } from '@shared/domain/integrationShapes';
import type { ProductsResult } from '@shared/domain/api';
import { SHOPPING } from '@shared/config/shopping';
import { api } from './api';
import { recallQuery, rememberQuery } from './queryMemory';
import { useQueryState } from './useQuery';

export type ProductsState =
  | { status: 'loading' }
  | { status: 'ok'; products: Product[] }
  /** The catalog couldn't answer (`not_configured`, `error`, …), or the call itself was refused. */
  | { status: 'failure'; failure: NonNullable<ProductsResult['failure']> | 'refused' };

const refKey = (refs: ProductRef[]) => JSON.stringify(refs.map((r) => [r.productId, r.variantId ?? '']));

/** The ref a product answers for: its variant when the ref named one, else the product. */
export function productMatches(ref: ProductRef, p: Product): boolean {
  return ref.variantId ? p.variantId === ref.variantId || (!p.variantId && p.productId === ref.productId) : p.productId === ref.productId;
}

/** Current details for `refs` (at most `SHOPPING.maxLookup`; extras are dropped rather than refused). An empty
 * list is answered at once with no products and no call. */
export function useProducts(refs: ProductRef[]): ProductsState {
  const lookup = useAction(api.shopping.products);
  const capped = useMemo(() => refs.slice(0, SHOPPING.maxLookup), [refs]);
  const key = `shopping.products:${refKey(capped)}`;
  const [state, setState] = useState<{ key: string; value: ProductsState } | null>(null);

  useEffect(() => {
    if (capped.length === 0) return;
    let live = true;
    lookup({ refs: capped })
      .then((r: ProductsResult) => {
        const value: ProductsState = r.failure ? { status: 'failure', failure: r.failure } : { status: 'ok', products: r.products };
        if (!r.failure) rememberQuery(key, value);
        if (live) setState({ key, value });
      })
      .catch(() => {
        if (live) setState({ key, value: { status: 'failure', failure: 'refused' } });
      });
    return () => {
      live = false;
    };
    // `key` is the content of `capped`; re-run only when the refs actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lookup]);

  if (capped.length === 0) return { status: 'ok', products: [] };
  if (state?.key === key) return state.value;
  return recallQuery<ProductsState>(key) ?? { status: 'loading' };
}

/** The family's active price watches (adults who can see gift ideas; anyone else gets an error → no chips). */
export function usePriceWatches(enabled: boolean) {
  return useQueryState(api.shopping.watches, enabled ? {} : 'skip');
}

export function usePriceWatch(watchId: Id<'priceWatches'>) {
  return useQueryState(api.shopping.watch, { watchId });
}

/** A watch's gift ideas (for the birthday countdown), once the watch has loaded. */
export function useGiftIdeasIfAny(giftIdeasId: Id<'giftIdeas'> | null) {
  return useQueryState(api.gifts.get, giftIdeasId ? { giftIdeasId } : 'skip');
}

export function useUnwatch() {
  return useMutation(api.shopping.unwatch);
}

/** The family's "now" (the demo clock when one is pinned), for day counts like "birthday in 9 days". */
export function useFamilyNow(): number | undefined {
  const state = useQueryState(api.clock.get, {});
  return state.status === 'ok' ? state.data.now : undefined;
}

/** Public holidays in the next `days` (server default when omitted). */
export function useUpcomingHolidays(days?: number) {
  return useQueryState(api.holidays.upcoming, days !== undefined ? { days } : {});
}

export function useHolidayQuestion(skipId: Id<'routineSkips'>) {
  return useQueryState(api.holidays.question, { skipId });
}

export function useHolidayAnswer() {
  return useMutation(api.holidays.answer);
}
