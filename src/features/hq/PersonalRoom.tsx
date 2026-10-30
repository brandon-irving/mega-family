import { useState } from 'react';
import { View } from 'react-native';
import { STORE_CATALOG, type FurnitureKindId } from '@shared/config/store';
import { FURNITURE_ART } from '@shared/sprite/storeArt';
import { furniturePicture } from '@/features/store/StoreScreen';
import type { RoomDoc } from '@/features/store/KidRoomPanel';
import type { MegaInfo } from '@/features/shell/megaInfo';
import { MegaSprite } from '@/ui/MegaSprite';
import { PixelArt } from '@/ui/PixelArt';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

const isKnown = (kind: string): kind is FurnitureKindId => Object.hasOwn(FURNITURE_ART, kind);

/** Find room for the entire piece, not only its anchor tile. Full rooms never silently overwrite a spot. */
export function furnitureSpot(room: Pick<RoomDoc, 'size' | 'furniture'>, kind: FurnitureKindId): { x: number; y: number } | null {
  const [w, h] = FURNITURE_ART[kind].size;
  for (let y = 2; y + h <= room.size.h; y++) for (let x = 0; x + w <= room.size.w; x++) {
    const taken = room.furniture.some((f) => {
      const [fw, fh] = isKnown(f.kind) ? FURNITURE_ART[f.kind].size : [1, 1];
      return x < f.x + fw && x + w > f.x && y < f.y + fh && y + h > f.y;
    });
    if (!taken) return { x, y };
  }
  return null;
}

/** Uses saved positions and existing pixel furniture. There is no continuous animation in personal rooms. */
export function PersonalRoom({ room, mega, name }: { room: RoomDoc; mega?: MegaInfo; name: string }) {
  const tokens = useTokens();
  const [width, setWidth] = useState(0);
  const cols = Math.max(1, room.size.w);
  const rows = Math.max(3, room.size.h);
  const tile = width / cols;
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="personal-room" style={{ width: '100%', aspectRatio: cols / rows, overflow: 'hidden', borderRadius: tokens.radii.lg, borderWidth: 1, borderColor: tokens.line, backgroundColor: tokens.surface }} accessible accessibilityLabel={`${name}. ${room.furniture.length ? room.furniture.map((f) => isKnown(f.kind) ? STORE_CATALOG[`furniture:${f.kind}`].label : f.kind).join(', ') : 'Ready to decorate.'}`}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: tile * 2, backgroundColor: room.wallColor, borderBottomWidth: 4, borderColor: tokens.line }} />
        {Array.from({ length: rows - 2 }, (_, y) => <View key={y} style={{ position: 'absolute', top: tile * (y + 2), height: 1, left: 0, right: 0, backgroundColor: tokens.line }} />)}
        {Array.from({ length: cols - 1 }, (_, x) => <View key={x} style={{ position: 'absolute', left: tile * (x + 1), width: 1, top: tile * 2, bottom: 0, backgroundColor: tokens.line, opacity: 0.5 }} />)}
        {width > 0 ? [...room.furniture].sort((a, b) => a.y - b.y).map((f, i) => {
          if (!isKnown(f.kind)) return null;
          return <View key={`${f.kind}-${i}`} style={{ position: 'absolute', left: f.x * tile, top: (f.y - 1) * tile }}><PixelArt picture={furniturePicture(f.kind)} scale={tile / 32} decorative /></View>;
        }) : null}
        {mega && width > 0 ? <View style={{ position: 'absolute', right: tile / 2, bottom: tile / 3 }}><MegaSprite hex={mega.hex} sticker={mega.sticker} face="happy" scale={tile / 32} accessibilityLabel={mega.name} /></View> : null}
      </View>
      <Text variant="caption" color="muted">{room.furniture.length ? `${room.furniture.length} ${room.furniture.length === 1 ? 'piece' : 'pieces'} placed` : 'A place for your MEGA. Add furniture to make it yours.'}</Text>
    </View>
  );
}
