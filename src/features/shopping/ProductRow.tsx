// Board GiftsProducts / ShopResults product row: a 52pt picture tile (the store's own image, or a pixel gift box
// labelled "No picture from the store"), the title on one line, the price in bold tabular digits with the store
// in grey, and a 40pt "Open" pill (a11y "Open {title} at {store}"). Gaps the boards don't draw, following the
// same row: a sale shows "was $35.00" struck through after the price (`listPriceCents`), and an out-of-stock
// product says "Out of stock" in place of the store and dims its picture. The image is read straight from the
// store's CDN and only kept in memory (`cachePolicy: 'memory'`): Shopify's catalog terms don't allow caching
// product images (CONTRACT v0.16).
import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { Rect, Svg } from 'react-native-svg';
import type { Product } from '@shared/domain/integrationShapes';
import { G4B_COPY, G4B_UI_COPY, fillCopy } from '@shared/config/copy';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { hiddenFromA11y } from '@/ui/a11y';
import { Glyph } from '@/features/integrations/glyphs';
import { formatPrice } from './format';

const TILE = 52;
const OPEN_HEIGHT = 40;

/** The board's 8×8 gift box (4pt cells), drawn in theme colors. */
const GIFT_BOX = ['........', '.R.RR.R.', '..RRRR..', 'GGGRRGGG', 'GGGRRGGG', 'GGGRRGGG', 'GGGRRGGG', 'GGGRRGGG'];

function GiftBox() {
  const tokens = useTokens();
  const color = { R: tokens.danger, G: tokens.muted } as const;
  return (
    <View {...hiddenFromA11y()}>
      <Svg width={32} height={32} viewBox="0 0 8 8">
        {GIFT_BOX.flatMap((row, y) => [...row].map((ch, x) => (ch === '.' ? null : <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color[ch as 'R' | 'G']} />)))}
      </Svg>
    </View>
  );
}

export function ProductThumb({ product }: { product: Product }) {
  const tokens = useTokens();
  const label = product.imageUrl ? fillCopy(G4B_UI_COPY.productPhoto, { title: product.title }) : G4B_UI_COPY.productNoPicture;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: TILE, height: TILE, borderRadius: tokens.radii.md, backgroundColor: tokens.line, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: product.available ? 1 : 0.5 }}
    >
      {product.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} style={{ width: TILE, height: TILE }} contentFit="cover" cachePolicy="memory" {...hiddenFromA11y()} />
      ) : (
        <GiftBox />
      )}
    </View>
  );
}

export function ProductRow({ product, onOpen, inset }: { product: Product; onOpen: (url: string) => void; inset?: boolean }) {
  const tokens = useTokens();
  const price = formatPrice(product.priceCents, product.currency);
  const was = product.listPriceCents !== undefined && product.listPriceCents > product.priceCents ? formatPrice(product.listPriceCents, product.currency) : null;
  return (
    <View
      testID="product-row"
      accessibilityLabel={product.available ? undefined : fillCopy(G4B_UI_COPY.productOutOfStockLabel, { title: product.title })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: tokens.radii.md,
        // Inside a gift idea the row sits one level up (surface on bg); on its own it's bg on surface.
        backgroundColor: inset ? tokens.surface : tokens.bg,
        borderWidth: 1,
        borderColor: tokens.line,
        padding: tokens.spacing.sm,
      }}
    >
      <ProductThumb product={product} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {product.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, overflow: 'hidden' }}>
          <Text weight="700" numberOfLines={1} style={{ fontVariant: ['tabular-nums'], color: product.available ? tokens.text : tokens.muted }}>
            {fillCopy(G4B_COPY.productPrice, { price })}
          </Text>
          {was ? (
            <Text variant="caption" color="muted" numberOfLines={1} style={{ textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] }}>
              {fillCopy(G4B_COPY.productWas, { price: was })}
            </Text>
          ) : null}
          <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1, color: product.available ? tokens.muted : tokens.warn }}>
            {product.available ? product.store : G4B_COPY.productOutOfStock}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => onOpen(product.url)}
        accessibilityRole="link"
        accessibilityLabel={fillCopy(G4B_UI_COPY.productOpenLabel, { title: product.title, store: product.store })}
        hitSlop={tokens.hitSlop}
        style={{ height: OPEN_HEIGHT, paddingHorizontal: tokens.spacing.md, borderRadius: OPEN_HEIGHT / 2, borderWidth: 1, borderColor: tokens.line, flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}
      >
        <Text variant="caption" weight="700">
          {G4B_UI_COPY.productOpen}
        </Text>
        <Glyph name="external" color={tokens.text} size={13} stroke={2.2} />
      </Pressable>
    </View>
  );
}

/** Two grey bars in a row's shape while `shopping.products` answers (never a bare "Loading…"). */
export function ProductRowSkeleton({ inset }: { inset?: boolean }) {
  const tokens = useTokens();
  const bar = (width: `${number}%`, height: number) => <View style={{ width, height, borderRadius: height / 2, backgroundColor: tokens.line }} />;
  return (
    <View
      testID="product-row-skeleton"
      {...hiddenFromA11y()}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: tokens.radii.md, backgroundColor: inset ? tokens.surface : tokens.bg, borderWidth: 1, borderColor: tokens.line, padding: tokens.spacing.sm }}
    >
      <View style={{ width: TILE, height: TILE, borderRadius: tokens.radii.md, backgroundColor: tokens.line }} />
      <View style={{ flex: 1, gap: 8 }}>
        {bar('75%', 12)}
        {bar('40%', 12)}
      </View>
    </View>
  );
}
