// Boards PriceDrop / PriceDropPush: a watched gift-list item got cheaper (CONTRACT v0.16 `priceDrop` card, sent
// only to adults who can see the gift ideas; the gift's recipient never gets it, which the server enforces).
// Was (struck through) beside Now, the product row, then Open in store / Stop watching side by side; after Stop
// watching the buttons give way to "Stopped watching…". "Now" is the watch's own latest observation
// (`lastPriceCents`); the row's picture and details are read live, falling back to what was saved with the
// watch (title, store, link) while that loads or if the store can't answer. Contract over board: the push has
// only Stop watching (`price.default`; a push button can't open a browser, CONTRACT §5), so Open in store lives
// here on the card.
import { View } from 'react-native';
import type { Id } from '@shared/domain/validators';
import type { Product } from '@shared/domain/integrationShapes';
import type { PriceWatch } from '@shared/domain/api';
import { G4B_COPY, G4B_UI_COPY, fillCopy } from '@shared/config/copy';
import { localDate } from '@shared/time';
import { productMatches, useFamilyNow, useGiftIdeasIfAny, usePriceWatch, useProducts, useUnwatch } from '@/data/useShopping';
import { useViewer } from '@/data/useViewer';
import { useFamilyDirectory } from '@/features/shell/familyDirectory';
import { useRunAction } from '@/features/shell/useRunAction';
import { CardFallback } from '@/features/kids/CardFallback';
import { IconCard } from '@/features/integrations/G4Card';
import { openLink } from '@/services/openLink';
import { Text } from '@/ui/Text';
import { CardActions } from '@/ui/ThreadCard';
import { useTokens } from '@/ui/theme';
import { daysUntil, formatPrice } from './format';
import { ProductRow } from './ProductRow';

export type PriceDropViewProps = {
  watch: PriceWatch;
  megaName: string;
  /** The gift's recipient ("Twin 1"), for the countdown and the footnote. */
  forName?: string;
  /** Days until the occasion, when the gift ideas could be read. */
  daysLeft?: number;
  /** The live catalog row, when it answered. */
  live?: Product | null;
  busy?: string | null;
  error?: string | null;
  onOpen: (url: string) => void;
  onStop: () => void;
};

export function PriceDropCardView({ watch, megaName, forName, daysLeft, live, busy, error, onOpen, onStop }: PriceDropViewProps) {
  const tokens = useTokens();
  const nowCents = watch.lastPriceCents ?? watch.baselinePriceCents;
  const price = formatPrice(nowCents, watch.currency);
  const was = formatPrice(watch.baselinePriceCents, watch.currency);
  const title =
    forName && daysLeft !== undefined && daysLeft > 0
      ? fillCopy(G4B_COPY.priceDropBody, { title: watch.title, price, was, who: forName, days: daysLeft })
      : fillCopy(G4B_COPY.priceDropBodyToday, { title: watch.title, price, was });
  const row: Product = live ?? { productId: watch.ref.productId, variantId: watch.ref.variantId, title: watch.title, priceCents: nowCents, currency: watch.currency, store: watch.store, url: watch.url, available: true };
  const stopped = watch.status !== 'watching';
  const box = (accent: boolean) => ({ flex: 1, borderRadius: tokens.radii.lg, backgroundColor: tokens.bg, borderWidth: 1, borderColor: accent ? tokens.accent : tokens.line, padding: 10, gap: 2 });
  return (
    <IconCard
      from={fillCopy(G4B_UI_COPY.priceDropFrom, { mega: megaName })}
      icon="tag"
      title={title}
      status={stopped ? { text: G4B_UI_COPY.priceStoppedBy, color: tokens.muted } : error ? { text: error, color: tokens.warn } : null}
      foot={forName ? fillCopy(G4B_UI_COPY.priceDropFoot, { who: forName }) : G4B_UI_COPY.priceDropFootNoName}
      testID="price-drop-card"
    >
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <View style={box(false)} accessible accessibilityLabel={`${G4B_UI_COPY.priceWas} ${was}`}>
          <Text variant="caption" weight="700" color="muted" style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {G4B_UI_COPY.priceWas}
          </Text>
          <Text variant="title" color="muted" numberOfLines={1} style={{ textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] }}>
            {was}
          </Text>
        </View>
        <View style={box(true)} accessible accessibilityLabel={`${G4B_UI_COPY.priceNow} ${price}`}>
          <Text variant="caption" weight="700" color="accent" style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {G4B_UI_COPY.priceNow}
          </Text>
          <Text variant="title" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
            {price}
          </Text>
        </View>
      </View>
      <ProductRow product={row} onOpen={onOpen} />
      {stopped ? null : (
        <CardActions
          actions={[
            { id: 'open', label: G4B_COPY.productOpen, onPress: () => onOpen(watch.url) },
            { id: 'stop', label: G4B_COPY.priceStopWatching, variant: 'ghost', onPress: onStop, loading: busy === 'stop', disabled: !!busy && busy !== 'stop' },
          ]}
        />
      )}
    </IconCard>
  );
}

export function PriceDropCard({ watchId, megaName }: { watchId: Id<'priceWatches'>; megaName: string }) {
  const state = usePriceWatch(watchId);
  const watch = state.status === 'ok' ? state.data : null;
  const gifts = useGiftIdeasIfAny(watch?.giftIdeasId ?? null);
  const live = useProducts(watch ? [watch.ref] : NO_REFS);
  const now = useFamilyNow();
  const viewer = useViewer();
  const dir = useFamilyDirectory();
  const unwatch = useUnwatch();
  const { busy, error, run } = useRunAction();
  if (!watch) return <CardFallback state={state} from={fillCopy(G4B_UI_COPY.priceDropFrom, { mega: megaName })} />;
  const tz = viewer?.family.timezone ?? 'UTC';
  const daysLeft = gifts.status === 'ok' && now !== undefined ? daysUntil(gifts.data.date, localDate(now, tz)) : undefined;
  const product = live.status === 'ok' ? (live.products.find((p) => productMatches(watch.ref, p)) ?? null) : null;
  return (
    <PriceDropCardView
      watch={watch}
      megaName={megaName}
      forName={dir.nameOf(watch.forMemberId) || undefined}
      daysLeft={daysLeft}
      live={product}
      busy={busy}
      error={error}
      onOpen={(url) => void openLink(url)}
      onStop={() => void run('stop', () => unwatch({ watchId }))}
    />
  );
}

const NO_REFS: never[] = [];
