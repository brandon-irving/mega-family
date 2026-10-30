// Board CalGifts (GD) + GiftsProducts / GiftsNoCatalog (G4b, CONTRACT v0.16): gift ideas for an upcoming
// birthday, with "Based on what's shared" tags (the server only ever cites household-shared facts, config
// GIFTS.sourceScopes) and Add to list on each idea. Adults only, never the birthday person — the server enforces
// both; this card just renders what it's allowed to see. G4b: each idea shows up to GIFTS.productsPerIdea real
// products ("In stores now"), read live through `shopping.products` from the idea's `productRefs` (nothing about
// a product is stored); an idea with no products keeps its web link marked "no price checked" (never a guessed
// price). Board gap: the "Watching the price" chip on an added idea isn't drawn on the boards; it follows the
// card's chip style (a one-line pill under the idea's title).
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { giftIdeasDoc } from '@shared/domain/api';
import type { Id } from '@shared/domain/validators';
import type { ProductRef } from '@shared/domain/integrationShapes';
import { GIFTS } from '@shared/config/calendar';
import { CALENDAR_COPY, IDEAS_COPY, G4B_COPY, G4B_UI_COPY, fillCopy } from '@shared/config/copy';
import { useAddGiftToList } from '@/data/useCalendarLayers';
import { useGiftIdeasIfAny, usePriceWatches, useProducts, productMatches, type ProductsState } from '@/data/useShopping';
import { useFamilyDirectory } from '@/features/shell/familyDirectory';
import { useRunAction } from '@/features/shell/useRunAction';
import { CardFallback } from '@/features/kids/CardFallback';
import { Glyph } from '@/features/integrations/glyphs';
import { ProductRow, ProductRowSkeleton } from '@/features/shopping/ProductRow';
import { domainOf, openLink } from '@/services/openLink';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { IdeaRow, TagList, ThreadCard } from '@/ui/ThreadCard';
import { useTokens } from '@/ui/theme';

export type GiftIdeas = Infer<typeof giftIdeasDoc>;
type Idea = GiftIdeas['ideas'][number];

const NONE: ProductsState = { status: 'ok', products: [] };

/** Every idea's refs (capped per idea), in idea order: one `shopping.products` call covers the whole card. */
export function giftRefs(gifts: GiftIdeas): ProductRef[] {
  return gifts.ideas.flatMap((idea) => (idea.productRefs ?? []).slice(0, GIFTS.productsPerIdea));
}

export function GiftsCardView({
  megaName,
  forName,
  gifts,
  busy,
  error,
  onAdd,
  products = NONE,
  watching = [],
  onOpen = () => {},
  selectedIndex,
}: {
  megaName: string;
  forName: string;
  gifts: GiftIdeas;
  busy?: string | null;
  error?: string | null;
  onAdd: (index: number) => void;
  /** The live catalog answer for `giftRefs(gifts)`. */
  products?: ProductsState;
  /** Indexes of ideas with an active price watch. */
  watching?: number[];
  onOpen?: (url: string) => void;
  /** Original gift index opened from Ideas; other gifts stay collapsed initially. */
  selectedIndex?: number;
}) {
  const tokens = useTokens();
  const [showOthers, setShowOthers] = useState(false);
  const title = fillCopy(CALENDAR_COPY.giftsTitle, { name: forName });
  if (gifts.status === 'queued') return <ThreadCard from={megaName} title={title} body={CALENDAR_COPY.giftsQueued} />;
  if (gifts.status === 'failed') return <ThreadCard from={megaName} title={title} body={CALENDAR_COPY.giftsFailed} />;
  const anyRefs = gifts.ideas.some((i) => (i.productRefs ?? []).length > 0);
  const noCatalog = products.status === 'failure' && products.failure === 'not_configured';
  // Board GiftsNoCatalog: links without prices, said plainly, when the store catalog isn't set up.
  const body = noCatalog || (!anyRefs && gifts.ideas.some((i) => !!i.url)) ? G4B_UI_COPY.giftsNoCatalog : undefined;
  // Store products on the card: the GiftsProducts footer (price alerts, never buys); otherwise the privacy footer.
  const withProducts = anyRefs && products.status !== 'failure';
  const focused = selectedIndex !== undefined && gifts.ideas[selectedIndex] !== undefined;
  const renderIdea = (idea: Idea, i: number) => (
    <IdeaBlock key={`${i}:${idea.title}`} idea={idea}
      sources={[...new Set(idea.basedOn)].flatMap((index) => gifts.basedOn[index] ? [gifts.basedOn[index].label] : [])}
      done={gifts.addedToList.includes(i)} watching={watching.includes(i)} loading={busy === `add${i}`}
      products={products} onAdd={() => onAdd(i)} onOpen={onOpen} />
  );
  const foot = withProducts ? G4B_UI_COPY.giftsProductsFoot : CALENDAR_COPY.giftsFoot;
  if (focused) {
    return (
      <View style={{ gap: tokens.spacing.md }}>
        <Text variant="caption" color="muted">{title}</Text>
        {body ? <Text variant="caption" color="muted">{body}</Text> : null}
        {renderIdea(gifts.ideas[selectedIndex], selectedIndex)}
        {error ? <Text style={{ color: tokens.danger }} accessibilityLiveRegion="polite">{error}</Text> : null}
        <Text variant="caption" color="muted">{foot}</Text>
        {gifts.ideas.length > 1 ? (
          <Button label={showOthers ? IDEAS_COPY.hideOtherGifts : IDEAS_COPY.otherGifts(gifts.ideas.length - 1)}
            variant="ghost" onPress={() => setShowOthers((shown) => !shown)} />
        ) : null}
        {showOthers ? <View style={{ gap: tokens.spacing.sm }}>{gifts.ideas.map((idea, i) => i === selectedIndex ? null : renderIdea(idea, i))}</View> : null}
      </View>
    );
  }
  return (
    <ThreadCard from={fillCopy(G4B_UI_COPY.giftsFrom, { mega: megaName })} title={title} body={body} foot={foot} status={error ? { text: error, tone: 'warn' } : undefined}>
      <View style={{ gap: tokens.spacing.sm }}>{gifts.ideas.map(renderIdea)}</View>
    </ThreadCard>
  );
}

function IdeaBlock({ idea, sources, done, watching, loading, products, onAdd, onOpen }: { idea: Idea; sources: string[]; done: boolean; watching: boolean; loading: boolean; products: ProductsState; onAdd: () => void; onOpen: (url: string) => void }) {
  const tokens = useTokens();
  const refs = (idea.productRefs ?? []).slice(0, GIFTS.productsPerIdea);
  const found = products.status === 'ok' ? refs.map((r) => products.products.find((p) => productMatches(r, p))).filter((p) => p !== undefined) : [];
  // Fall back to the idea's web link when the catalog has nothing for it (never a made-up price).
  // With store products (or their rows loading) the rows carry real prices, so the idea drops its "· $35" estimate.
  const storePriced = refs.length > 0 && products.status !== 'failure';
  const showLink = !!idea.url && (refs.length === 0 || products.status === 'failure' || (products.status === 'ok' && found.length === 0));
  return (
    <View testID={`gift-idea-${idea.title}`} style={{ borderRadius: tokens.radii.lg, backgroundColor: tokens.bg, borderWidth: 1, borderColor: tokens.line, padding: 10, gap: tokens.spacing.sm }}>
      <IdeaRow bare title={idea.title} why={storePriced ? idea.why : [idea.why, idea.price].filter(Boolean).join(' · ')} actionLabel={done ? CALENDAR_COPY.giftsAdded : CALENDAR_COPY.giftsAdd} done={done} loading={loading} onPress={onAdd} />
      <TagList label={CALENDAR_COPY.giftsBasedOn} tags={sources} />
      {watching ? <WatchingChip title={idea.title} /> : null}
      {refs.length > 0 && products.status === 'loading' ? refs.map((r) => <ProductRowSkeleton key={`${r.productId}:${r.variantId ?? ''}`} inset />) : null}
      {found.length > 0 ? (
        <View style={{ gap: tokens.spacing.sm }}>
          <Text variant="caption" weight="700" color="muted" style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {G4B_COPY.giftsProducts}
          </Text>
          {found.map((p) => (
            <ProductRow key={`${p.productId}:${p.variantId ?? ''}`} product={p} onOpen={onOpen} inset />
          ))}
        </View>
      ) : null}
      {showLink && idea.url ? <LinkRow url={idea.url} title={idea.title} onOpen={onOpen} /> : null}
    </View>
  );
}

function WatchingChip({ title }: { title: string }) {
  const tokens = useTokens();
  return (
    <View
      accessible
      accessibilityLabel={fillCopy(G4B_UI_COPY.giftsWatchingLabel, { title })}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: tokens.radii.pill, borderWidth: 1, borderColor: tokens.accent }}
    >
      <Glyph name="tag" color={tokens.accent} size={12} stroke={2.4} />
      <Text variant="caption" weight="700" numberOfLines={1} style={{ color: tokens.accent }}>
        {G4B_COPY.giftsWatching}
      </Text>
    </View>
  );
}

/** Board GiftsNoCatalog: the idea's web link, "{domain} · no price checked". */
function LinkRow({ url, title, onOpen }: { url: string; title: string; onOpen: (url: string) => void }) {
  const tokens = useTokens();
  const domain = domainOf(url);
  return (
    <Pressable
      onPress={() => onOpen(url)}
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${domain}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: tokens.touchTarget, borderRadius: tokens.radii.md, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.line, paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md }}
    >
      <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: tokens.line, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="caption" weight="700" color="muted">
          {(domain[0] ?? '?').toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {fillCopy(G4B_UI_COPY.giftsLinkNoPrice, { domain })}
        </Text>
      </View>
      <Glyph name="chevron" color={tokens.muted} size={16} />
    </Pressable>
  );
}

export function GiftsCard({ giftIdeasId, megaName, selectedIndex }: { giftIdeasId: Id<'giftIdeas'>; megaName: string; selectedIndex?: number }) {
  const state = useGiftIdeasIfAny(giftIdeasId);
  const gifts = state.status === 'ok' ? state.data : null;
  const products = useProducts(gifts ? giftRefs(gifts) : NO_REFS);
  const watches = usePriceWatches(gifts !== null);
  const dir = useFamilyDirectory();
  const add = useAddGiftToList();
  const { busy, error, run } = useRunAction();
  if (!gifts) return <CardFallback state={state} from={megaName} />;
  const watching = watches.status === 'ok' ? watches.data.filter((w) => w.giftIdeasId === giftIdeasId && w.status === 'watching').map((w) => w.ideaIndex) : [];
  return (
    <GiftsCardView
      megaName={megaName}
      forName={dir.nameOf(gifts.forMemberId)}
      gifts={gifts}
      selectedIndex={selectedIndex}
      busy={busy}
      error={error}
      onAdd={(index) => run(`add${index}`, () => add({ giftIdeasId, index }))}
      products={products}
      watching={watching}
      onOpen={(url) => void openLink(url)}
    />
  );
}

const NO_REFS: ProductRef[] = [];
