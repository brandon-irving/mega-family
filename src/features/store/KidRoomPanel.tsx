// Boards StoreRoom and StoreTray: the way into the Store from the kid's own room — a Store button with the
// balance, "You have N Mega Bucks", Decorate and Open the Store — and the Decorate tray, where furniture
// they own waits (bought pieces not yet in the room are marked NEW) and a tap puts it in the room
// (`rooms.update`; the server lets a kid place only furniture they own).
//
// PLACEHOLDER (G5): the tile-map room itself (walls, floor, walking MEGA, drag-to-place) is HQ's G5 work.
// Until then the room area shows a note, and a placed piece goes to the next free spot along the floor.
import { Pressable, ScrollView, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { roomDoc } from '@shared/domain/api';
import { fillCopy, STORE_COPY } from '@shared/config/copy';
import { storeSectionOf, type FurnitureKindId } from '@shared/config/store';
import { BucksCoin } from '@/ui/BucksCoin';
import { Button } from '@/ui/Button';
import { PixelArt } from '@/ui/PixelArt';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { furniturePicture } from './StoreScreen';
import type { CatalogItem } from './storeModel';

export type RoomDoc = Infer<typeof roomDoc>;
export type TrayPiece = { kind: FurnitureKindId; label: string; isNew: boolean };

/** Owned furniture for the tray: NEW when it isn't placed in the room yet. */
export function trayPieces(items: CatalogItem[], room: Pick<RoomDoc, 'furniture'> | null): TrayPiece[] {
  const placed = new Set((room?.furniture ?? []).map((f) => f.kind));
  return items
    .filter((i) => i.owned && storeSectionOf(i.id) === 'furniture')
    .map((i) => {
      const kind = i.id.slice(i.id.indexOf(':') + 1) as FurnitureKindId;
      return { kind, label: i.label, isNew: !placed.has(kind) };
    })
    .sort((a, b) => Number(b.isNew) - Number(a.isNew));
}

/** The next free floor spot for a piece (G5 replaces this with drag-to-place on the tile map). */
export function nextSpot(room: Pick<RoomDoc, 'furniture' | 'size'>): { x: number; y: number } {
  const taken = new Set(room.furniture.map((f) => `${f.x},${f.y}`));
  for (let y = 2; y < room.size.h; y++) for (let x = 0; x < room.size.w; x++) if (!taken.has(`${x},${y}`)) return { x, y };
  return { x: 0, y: 2 };
}

export function KidRoomPanel({
  balance,
  decorating,
  tray,
  onOpenStore,
  onDecorate,
  onDone,
  onPlace,
}: {
  balance: number | null;
  decorating: boolean;
  tray: TrayPiece[];
  onOpenStore: () => void;
  onDecorate: () => void;
  onDone: () => void;
  onPlace: (piece: TrayPiece) => void;
}) {
  const tokens = useTokens();
  if (decorating) {
    return (
      <View style={{ gap: 10, paddingTop: tokens.spacing.md, backgroundColor: tokens.surface, borderTopWidth: 1, borderColor: tokens.line, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: tokens.spacing.lg }}>
          <Text variant="caption" weight="700" color="muted" style={{ flex: 1 }}>
            {STORE_COPY.trayTitle.toUpperCase()}
          </Text>
          <Button label={STORE_COPY.done} variant="secondary" onPress={onDone} />
        </View>
        <ScrollView keyboardDismissMode="on-drag" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.lg }}>
          {tray.map((k) => (
            <Pressable
              key={k.kind}
              onPress={() => onPlace(k)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${k.label}${k.isNew ? ', new' : ''}`}
              style={{ width: 84, height: 112, borderRadius: tokens.radii.lg, borderWidth: 1, borderColor: k.isNew ? tokens.bucks : tokens.line, backgroundColor: tokens.bg, alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {k.isNew && (
                <View style={{ position: 'absolute', top: 6, right: 6, paddingHorizontal: 6, borderRadius: 6, backgroundColor: tokens.bucks }}>
                  <Text variant="caption" weight="700" style={{ color: tokens.bg }}>
                    {STORE_COPY.trayNew}
                  </Text>
                </View>
              )}
              <PixelArt picture={furniturePicture(k.kind)} scale={56 / Math.max(furniturePicture(k.kind).w, furniturePicture(k.kind).h)} decorative />
              <Text variant="caption" weight="600">
                {k.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={{ gap: tokens.spacing.md, padding: tokens.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, borderRadius: tokens.radii.lg, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.line, padding: tokens.spacing.md }}>
        <BucksCoin size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{fillCopy(STORE_COPY.youHave, { n: balance ?? 0 })}</Text>
          <Text variant="caption" color="muted">
            {STORE_COPY.earnMore}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label={STORE_COPY.decorate} variant="secondary" onPress={onDecorate} style={{ flex: 1 }} size={tokens.buttonSize} />
        <Button label={STORE_COPY.openStore} onPress={onOpenStore} style={{ flex: 1 }} size={tokens.buttonSize} />
      </View>
    </View>
  );
}
