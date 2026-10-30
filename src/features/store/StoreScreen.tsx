// Boards Store / StoreStickers / StoreColors / StoreAntennas / StoreEyes / StoreConfirm / StoreBought: the
// kid's Store. Header with the Mega Bucks balance; tabs from config (STORE_TABS); for look tabs, a try-on
// stage where the kid's own MEGA wears the selected part live (the real sprite engine, including the new
// antennas, eye colors and the Muse anime eyes); a 3-up grid of pixel tiles with prices; a bottom bar
// (Wearing / Wear it / Buy for N / Need N more) and the buy sheet (confirm → "It's yours!").
// Buying is `store.buy` (kids only, server checks balance and ownership); a bought look part is put on
// right away with `megas.update` (the board's "Zap is wearing the star antenna"); bought furniture waits in
// the room's Decorate tray (StoreRoom / StoreTray).
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { fillCopy, MODAL_COPY, STORE_COPY } from '@shared/config/copy';
import { STORE_TAB_ROW, STORE_TABS } from '@shared/config/store';
import { renderFurniture, type Picture } from '@shared/sprite';
import type { FurnitureKindId } from '@shared/config/store';
import { ModalSheet } from '@/ui/ModalSheet';
import { BucksCoin } from '@/ui/BucksCoin';
import { Button } from '@/ui/Button';
import { MegaSprite } from '@/ui/MegaSprite';
import { PixelArt } from '@/ui/PixelArt';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { BobbingMega } from '@/features/kids/MorningRoutine';
import { barFor, type CatalogItem, firstPick, isWearing, type Look, type TabId, type Tile, tilesFor, tryOn } from './storeModel';

const FURNITURE_ART = new Map<FurnitureKindId, Picture>();
/** Each piece is drawn once per app run (pure function of its kind). */
export function furniturePicture(kind: FurnitureKindId): Picture {
  let pic = FURNITURE_ART.get(kind);
  if (!pic) FURNITURE_ART.set(kind, (pic = renderFurniture(kind)));
  return pic;
}

export function TileArt({ tile, look, box }: { tile: Tile; look: Look; box: number }) {
  if (tile.furniture) {
    const pic = furniturePicture(tile.furniture);
    return <PixelArt picture={pic} scale={Math.min(box / pic.w, box / pic.h)} decorative />;
  }
  const worn = tryOn(look, tile);
  return <MegaSprite hex={worn.hex} sticker={worn.sticker} parts={worn} badge scale={box / 30} accessibilityLabel={tile.label} />;
}

export type SheetState = { kind: 'none' } | { kind: 'confirm' } | { kind: 'bought'; furniture: boolean };

export type StoreScreenViewProps = {
  megaName: string;
  balance: number;
  items: CatalogItem[];
  look: Look;
  initialTab?: TabId;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onBuy: (tile: Tile) => Promise<boolean>;
  onWear: (look: Look) => void;
  onDecorate: () => void;
};

export function StoreScreenView({ megaName, balance, items, look, initialTab = 'furniture', busy, error, onClose, onBuy, onWear, onDecorate }: StoreScreenViewProps) {
  const tokens = useTokens();
  const compactTabs = useWindowDimensions().width < STORE_TAB_ROW.compactBelow;
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<TabId>(initialTab);
  const tiles = useMemo(() => tilesFor(tab, items, look), [tab, items, look]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' });
  // G6 walkthrough fix (P1): when nothing's explicitly picked (`picked[tab]` unset), `selKey` falls back
  // to `firstPick(tiles)` — live, every render. Buying flips the purchased tile to `owned` in `items`
  // (the real screen's `store.catalog` query re-renders with that), so `firstPick` then re-picks the
  // *next* unowned tile — and the "bought" sheet used to read its name/art straight off that recomputed
  // `sel`, naming whatever got re-selected instead of what was actually bought. `bought` snapshots the
  // purchased tile (and its already-correct display name) the moment the purchase succeeds, so the sheet
  // keeps showing it regardless of how `sel` moves afterwards.
  const [bought, setBought] = useState<{ tile: Tile; name: string } | null>(null);
  const selKey = picked[tab] ?? firstPick(tiles);
  const sel = tiles.find((t) => t.key === selKey) ?? tiles[0];
  const lookTab = tab !== 'furniture';
  const name = sel ? `${sel.label}${STORE_COPY.noun[tab] ?? ''}` : '';
  const bar = sel ? barFor(sel, look, balance) : null;
  const preview = sel ? tryOn(look, sel) : look;
  // The "bought" sheet always shows the snapshot, never the live (possibly-moved-on) `sel`/`name`/`preview`.
  const shown = sheet.kind === 'bought' && bought ? bought.tile : sel;
  const shownName = sheet.kind === 'bought' && bought ? bought.name : name;
  const shownPreview = sheet.kind === 'bought' && bought ? tryOn(look, bought.tile) : preview;

  const barButton = !bar ? null : bar.kind === 'wearing' ? (
    <Button label={STORE_COPY.wearing} variant="secondary" disabled size={{ height: 56, fontSize: tokens.type.title.fontSize }} />
  ) : bar.kind === 'inRoom' ? (
    <Button label={STORE_COPY.inRoom} variant="secondary" disabled size={{ height: 56, fontSize: tokens.type.title.fontSize }} />
  ) : bar.kind === 'wear' ? (
    <Button label={STORE_COPY.wearIt} variant="secondary" onPress={() => onWear(preview)} loading={busy} size={{ height: 56, fontSize: tokens.type.title.fontSize }} />
  ) : bar.kind === 'short' ? (
    <Button label={fillCopy(STORE_COPY.needMore, { n: bar.short })} variant="secondary" disabled size={{ height: 56, fontSize: tokens.type.title.fontSize }} />
  ) : (
    <Button label={fillCopy(STORE_COPY.buyFor, { n: bar.price })} onPress={() => setSheet({ kind: 'confirm' })} size={{ height: 56, fontSize: tokens.type.title.fontSize }} />
  );
  const barNote = !bar ? null : bar.kind === 'short' ? STORE_COPY.needNote : bar.kind === 'buy' ? fillCopy(STORE_COPY.afterNote, { have: balance, left: bar.left }) : null;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.sm, height: 60 }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back to your room" style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="title">‹</Text>
        </Pressable>
        <Text variant="headline" style={{ flex: 1 }} accessibilityRole="header">
          {STORE_COPY.title}
        </Text>
        <View accessibilityLabel={fillCopy(STORE_COPY.youHave, { n: balance })} style={{ height: 40, paddingLeft: tokens.spacing.sm, paddingRight: tokens.spacing.md, borderRadius: 20, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.line, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
          <BucksCoin size={24} />
          <Text variant="title" style={{ color: tokens.bucks }}>
            {balance}
          </Text>
        </View>
      </View>

      {/* One fixed row: each tab sized to its label, sharing what's left (UX review: a scrolling row hid
          Furniture off-screen; an even split cut "Furniture" and "Antennas" short). */}
      <View style={{ flexDirection: 'row', gap: STORE_TAB_ROW.gap, paddingHorizontal: tokens.spacing.lg, paddingTop: tokens.spacing.md, paddingBottom: tokens.spacing.xs }} accessibilityRole="tablist" testID="store-tabs">
        {STORE_TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id as TabId)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flexGrow: 1, flexShrink: 1, height: tokens.buttonSize.height, paddingHorizontal: compactTabs ? STORE_TAB_ROW.compactPadding : STORE_TAB_ROW.padding, borderRadius: tokens.radii.pill, borderWidth: 1, borderColor: on ? tokens.text : tokens.line, backgroundColor: on ? tokens.text : 'transparent', justifyContent: 'center', alignItems: 'center' }}
            >
              <Text variant="caption" weight="700" numberOfLines={1} style={{ fontSize: tokens.type.caption.fontSize - (compactTabs ? STORE_TAB_ROW.compactFontStep : 0), color: on ? tokens.bg : tokens.text }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {lookTab && sel && (
        <View style={{ marginTop: 10, marginHorizontal: tokens.spacing.lg, height: 236, borderRadius: tokens.radii.xl, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.line, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' }}>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 52, backgroundColor: tokens.bg, borderTopWidth: 1, borderTopColor: tokens.line }} />
          <View style={{ position: 'absolute', left: 14, top: 12, gap: 2 }}>
            <Text variant="caption" weight="700" color="muted">
              {(isWearing(look, sel) ? STORE_COPY.wearingNow : STORE_COPY.tryingOn).toUpperCase()}
            </Text>
            <Text variant="label">{name}</Text>
          </View>
          <View style={{ marginBottom: 18 }} accessibilityLabel={`${megaName} ${isWearing(look, sel) ? STORE_COPY.wearingNow : STORE_COPY.tryingOn} ${name}`}>
            <BobbingMega mega={{ hex: preview.hex, sticker: preview.sticker, parts: preview }} happy={false} scale={5} />
          </View>
        </View>
      )}

      <ScrollView keyboardDismissMode="on-drag" style={{ flex: 1 }} contentContainerStyle={{ padding: tokens.spacing.lg, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((t) => {
          const on = t.key === sel?.key;
          const wearing = isWearing(look, t);
          const tag = wearing ? STORE_COPY.wearing : t.owned ? (t.price ? STORE_COPY.owned : t.section === 'furniture' ? STORE_COPY.free : STORE_COPY.yours) : String(t.price);
          const priced = !wearing && !t.owned;
          const afford = t.price <= balance;
          return (
            <Pressable
              key={t.key}
              onPress={() => setPicked((p) => ({ ...p, [tab]: t.key }))}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t.label}${STORE_COPY.noun[tab] ?? ''}, ${priced ? `${t.price} Mega Bucks` : tag}`}
              style={{ flexBasis: '30%', flexGrow: 1, height: tab === 'furniture' ? 132 : 126, borderRadius: tokens.radii.lg, borderWidth: 2, borderColor: on ? tokens.hint : tokens.line, backgroundColor: on ? tokens.hintSurface : tokens.surface, alignItems: 'center', justifyContent: 'space-between', padding: tokens.spacing.sm }}
            >
              <View style={{ height: 64, justifyContent: 'center' }}>
                <TileArt tile={t} look={look} box={56} />
              </View>
              <Text variant="caption" weight="700" numberOfLines={1}>
                {t.label}
              </Text>
              <View style={{ height: 22, paddingHorizontal: tokens.spacing.sm, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: priced ? tokens.bucksSurface : tokens.line, opacity: priced && !afford ? 0.5 : 1 }}>
                {priced && <BucksCoin size={12} />}
                <Text variant="caption" weight="700" style={{ color: priced ? tokens.bucks : tokens.muted }}>
                  {tag}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xl, borderTopWidth: 1, borderTopColor: tokens.line, gap: 6 }}>
        {barButton}
        {barNote || error ? (
          <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
            {error ?? barNote}
          </Text>
        ) : null}
      </View>

      {/* Closes with its ✕, the scrim, a drag down, Android back or Escape (src/ui/ModalSheet). */}
      <ModalSheet open={sheet.kind !== 'none' && !!shown} closeLabel={MODAL_COPY.close} showTitle={false} testID="store-sheet" onClose={() => setSheet({ kind: 'none' })} title={sheet.kind === 'confirm' ? fillCopy(STORE_COPY.confirmTitle, { item: name }) : STORE_COPY.boughtTitle}>
        {shown && sheet.kind !== 'none' && (
          <View style={{ alignItems: 'center', gap: tokens.spacing.sm }}>
            <Animated.View key={sheet.kind} entering={sheet.kind === 'bought' && !reduced ? ZoomIn.duration(tokens.durations.slow) : undefined} style={{ marginTop: tokens.spacing.sm }}>
              {shown.furniture ? <PixelArt picture={furniturePicture(shown.furniture)} scale={2} decorative /> : <MegaSprite hex={shownPreview.hex} sticker={shownPreview.sticker} parts={shownPreview} face={sheet.kind === 'bought' ? 'happy' : 'open'} scale={3} accessibilityLabel={megaName} />}
            </Animated.View>
            <Text variant="headline" accessibilityRole="header">
              {sheet.kind === 'confirm' ? fillCopy(STORE_COPY.confirmTitle, { item: name }) : STORE_COPY.boughtTitle}
            </Text>
            <Text color="muted" style={{ textAlign: 'center' }}>
              {sheet.kind === 'confirm'
                ? fillCopy(STORE_COPY.confirmBody, { price: sel.price, left: balance - sel.price })
                : sheet.furniture
                  ? fillCopy(STORE_COPY.boughtFurniture, { item: shown.label.toLowerCase() })
                  : fillCopy(STORE_COPY.boughtLook, { mega: megaName, item: shownName.toLowerCase() })}
            </Text>
            <View style={{ alignSelf: 'stretch', gap: tokens.spacing.sm, marginTop: 10 }}>
              {sheet.kind === 'confirm' ? (
                <>
                  <Button
                    label={STORE_COPY.buyIt}
                    loading={busy}
                    size={{ height: 56, fontSize: tokens.type.title.fontSize }}
                    onPress={async () => {
                      if (await onBuy(sel)) {
                        setBought({ tile: sel, name });
                        setSheet({ kind: 'bought', furniture: sel.section === 'furniture' });
                      }
                    }}
                  />
                  <Button label={STORE_COPY.notNow} variant="secondary" disabled={busy} size={{ height: 56, fontSize: tokens.type.title.fontSize }} onPress={() => setSheet({ kind: 'none' })} />
                </>
              ) : sheet.furniture ? (
                <>
                  <Button label={STORE_COPY.decorateNow} size={{ height: 56, fontSize: tokens.type.title.fontSize }} onPress={onDecorate} />
                  <Button label={STORE_COPY.keepShopping} variant="secondary" size={{ height: 56, fontSize: tokens.type.title.fontSize }} onPress={() => setSheet({ kind: 'none' })} />
                </>
              ) : (
                <Button label={STORE_COPY.done} variant="secondary" size={{ height: 56, fontSize: tokens.type.title.fontSize }} onPress={() => setSheet({ kind: 'none' })} />
              )}
            </View>
            {error ? (
              <Text variant="caption" style={{ color: tokens.warn }}>
                {error}
              </Text>
            ) : null}
          </View>
        )}
      </ModalSheet>
    </View>
  );
}
