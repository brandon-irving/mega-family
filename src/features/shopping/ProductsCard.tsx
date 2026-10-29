// Boards ShopResults / ShopEmpty / ShopNotSetUp: an adult's `shop_search` answer (CONTRACT v0.16 `products`
// card, written only into the asker's own thread). The card holds product refs only; current titles, prices and
// pictures are read live through `shopping.products` (Shopify's catalog terms forbid caching results), with
// loading rows while it answers. Never a guessed price: a catalog that isn't set up or can't answer says so.
// Contract over board: ShopEmpty's "Show up to $50" / "Watch for one under $40" and ShopNotSetUp's "Search the
// web instead" have no function in v0.16 (the adult just asks MEGA again), so those buttons aren't drawn; the
// card's title is the asker's own query (`productsFor`), since the card carries no separate headline.
import { View } from 'react-native';
import type { Card as CardKind } from '@shared/domain/messages';
import { G4B_COPY, G4B_UI_COPY, fillCopy } from '@shared/config/copy';
import { SHOPPING } from '@shared/config/shopping';
import { type ProductsState, useProducts } from '@/data/useShopping';
import { IconCard } from '@/features/integrations/G4Card';
import { openLink } from '@/services/openLink';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { ProductRow, ProductRowSkeleton } from './ProductRow';

type ProductsCardKind = Extract<CardKind, { kind: 'products' }>;

/** What a failed lookup says (fail closed: never a made-up price). */
export function productsFailureText(failure: NonNullable<ProductsCardKind['failure']> | 'refused'): { title: string; body?: string } {
  if (failure === 'not_configured') return { title: G4B_UI_COPY.productsNotSetUp, body: G4B_UI_COPY.productsNotSetUpBody };
  return { title: G4B_COPY.productsUnavailable };
}

export function ProductsCardView({ card, megaName, state, onOpen }: { card: ProductsCardKind; megaName: string; state: ProductsState; onOpen: (url: string) => void }) {
  const tokens = useTokens();
  const from = fillCopy(G4B_COPY.productsFrom, { mega: megaName });
  const query = fillCopy(G4B_COPY.productsFor, { query: card.query });
  const failure = card.failure ?? (state.status === 'failure' ? state.failure : undefined);
  if (failure) {
    const f = productsFailureText(failure);
    return <IconCard from={from} icon="cart" title={f.title} body={f.body ?? query} testID="products-card" />;
  }
  if (card.refs.length === 0 || (state.status === 'ok' && state.products.length === 0)) {
    return <IconCard from={from} icon="cart" title={G4B_COPY.productsNone} body={query} testID="products-card" />;
  }
  if (state.status === 'loading') {
    return (
      <IconCard from={from} icon="cart" title={query} testID="products-card">
        <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
          {G4B_COPY.productsLoading}
        </Text>
        <View style={{ gap: tokens.spacing.sm }}>
          {card.refs.slice(0, SHOPPING.searchLimit).map((r) => (
            <ProductRowSkeleton key={`${r.productId}:${r.variantId ?? ''}`} />
          ))}
        </View>
      </IconCard>
    );
  }
  const products = state.status === 'ok' ? state.products : [];
  return (
    <IconCard from={from} icon="cart" title={query} foot={G4B_COPY.productsFoot} testID="products-card">
      <View style={{ gap: tokens.spacing.sm }}>
        {products.map((p) => (
          <ProductRow key={`${p.productId}:${p.variantId ?? ''}`} product={p} onOpen={onOpen} />
        ))}
      </View>
    </IconCard>
  );
}

export function ProductsCard({ card, megaName }: { card: ProductsCardKind; megaName: string }) {
  // A failed card has no refs to look up; `useProducts([])` answers at once without a call.
  const state = useProducts(card.failure ? [] : card.refs);
  return <ProductsCardView card={card} megaName={megaName} state={state} onOpen={(url) => void openLink(url)} />;
}
