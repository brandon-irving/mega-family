// HQ placeholder (G1 scope item 9 — the full tile-room render is a later gate). Reads hq.room so
// navigation and data plumbing are complete even before the room is drawn.
// GD (Screen 11, boards StoreRoom / StoreTray): a kid's own room also shows the Store button with their
// balance, Decorate and Open the Store, and the Decorate tray (src/features/store/KidRoomPanel.tsx).
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { fillCopy, STORE_COPY } from '@shared/config/copy';
import { useHqRoom } from '@/data/useHq';
import { useMegaDirectory } from '@/data/useMegaDirectory';
import { useBucksBalance } from '@/data/useKids';
import { useStoreCatalog, useUpdateRoom } from '@/data/useStore';
import { useViewer } from '@/data/useViewer';
import { HqRoomList } from '@/features/hq/HqRoomList';
import { KidRoomPanel, nextSpot, type RoomDoc, trayPieces } from '@/features/store/KidRoomPanel';
import { BucksCoin } from '@/ui/BucksCoin';
import { Screen } from '@/ui/Screen';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export default function HqRoute() {
  const { memberId, decorate } = useLocalSearchParams<{ memberId?: string; decorate?: string }>();
  const tokens = useTokens();
  const room = useHqRoom(memberId as never);
  const viewer = useViewer();
  // G1 fix: `room.megas` is just `{ megaId, station, label, busy }` — enough to say "at the charger" but
  // not whose MEGA that is. `family.members` is already loaded family-wide data (DRY: no new backend
  // call), keyed by megaId, so HqRoomList can show each one's badge and name next to its status.
  const megaById = useMegaDirectory();
  const ownKidRoom = !!memberId && viewer?.member._id === memberId && viewer.member.role === 'kid';

  if (room === undefined) return <LoadingScreen label="Opening HQ…" />;

  return (
    <Screen scroll presentation="tab">
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.md }}>
        <Text variant="headline" style={{ flex: 1 }}>
          {memberId ? 'My room' : 'HQ'}
        </Text>
        {ownKidRoom && <StoreButton />}
      </View>
      {room ? (
        <HqRoomList room={room} megaById={megaById} />
      ) : (
        <Text color="muted">The room (tile map, walking MEGAs, stations) arrives in a later milestone.</Text>
      )}
      {ownKidRoom && room && <KidRoom room={room.room} startDecorating={decorate === '1'} />}
    </Screen>
  );
}

function StoreButton() {
  const tokens = useTokens();
  const balance = useBucksBalance();
  const n = balance.status === 'ok' ? balance.data.balance : 0;
  return (
    <Pressable
      onPress={() => router.push('/store')}
      accessibilityRole="button"
      accessibilityLabel={`${STORE_COPY.title}, ${fillCopy(STORE_COPY.youHave, { n })}`}
      style={{ height: 40, paddingLeft: tokens.spacing.sm, paddingRight: 14, borderRadius: 20, backgroundColor: tokens.hintLine, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}
    >
      <BucksCoin size={24} />
      <Text variant="label" style={{ color: tokens.bg }}>
        {fillCopy(STORE_COPY.roomStore, { n })}
      </Text>
    </Pressable>
  );
}

function KidRoom({ room, startDecorating }: { room: RoomDoc; startDecorating: boolean }) {
  const tokens = useTokens();
  const [decorating, setDecorating] = useState(startDecorating);
  const balance = useBucksBalance();
  const catalog = useStoreCatalog();
  const updateRoom = useUpdateRoom();
  const tray = catalog.status === 'ok' ? trayPieces(catalog.data.items, room) : [];
  return (
    <View style={{ marginTop: tokens.spacing.lg, marginHorizontal: -tokens.spacing.lg }}>
      <Text variant="caption" color="muted" style={{ marginHorizontal: tokens.spacing.lg, marginBottom: tokens.spacing.sm }}>
        {STORE_COPY.roomPlaceholder}
      </Text>
      <KidRoomPanel
        balance={balance.status === 'ok' ? balance.data.balance : null}
        decorating={decorating}
        tray={tray}
        onOpenStore={() => router.push('/store')}
        onDecorate={() => setDecorating(true)}
        onDone={() => setDecorating(false)}
        onPlace={(piece) => void updateRoom({ furniture: [...room.furniture, { kind: piece.kind, ...nextSpot(room) }] }).catch(() => {})}
      />
    </View>
  );
}
