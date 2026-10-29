// HQ (canvas Screen 2, board HQ). G5: the shared HQ is the pixel tile room with the family's MEGAs walking to
// the stations `hq.room` reports (src/features/hq/HqRoom.tsx), a header with how many are at work and "My room".
// A member's own room (`/hq/[memberId]`) still lists its MEGAs (HqRoomList) until the Room board's tile render.
// GD (Screen 11, boards StoreRoom / StoreTray): a kid's own room also shows the Store button with their
// balance, Decorate and Open the Store, and the Decorate tray (src/features/store/KidRoomPanel.tsx).
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { fillCopy, G5_UI_COPY, STORE_COPY } from '@shared/config/copy';
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
import type { Station } from '@shared/domain/enums';
import type { StickerId } from '@shared/config/looks';
import { useFamilyMembers } from '@/data/useFamily';
import { useQuery } from '@/data/useQuery';
import { api } from '@/data/api';
import { useFamilyNow } from '@/data/useShopping';
import { HqRoom, type RoomMega } from '@/features/hq/HqRoom';
import type { HqRoom as HqRoomData } from '@/features/hq/HqRoomList';
import { Button } from '@/ui/Button';

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
  if (!memberId && room) return <SharedHq room={room} />;

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

/** The board's widest room on a phone: the screen minus the 16pt gutters, never wider than the art's 2× size. */
const ROOM_MAX = 640;

function SharedHq({ room }: { room: HqRoomData }) {
  const tokens = useTokens();
  const viewer = useViewer();
  const members = useFamilyMembers();
  const hub = useQuery(api.megas.family, {});
  const now = useFamilyNow();
  const { width: screen } = useWindowDimensions();
  const width = Math.min(ROOM_MAX, screen - tokens.spacing.lg * 2);
  const owners = new Map((members ?? []).filter((m) => m.mega).map((m) => [m.mega!._id as string, m]));

  const megas: RoomMega[] = room.megas.flatMap((m) => {
    const owner = owners.get(m.megaId);
    const look = owner?.mega ? { name: owner.mega.name, hex: owner.mega.look.hex, sticker: owner.mega.look.sticker as StickerId } : hub && hub.megaId === m.megaId ? { name: hub.name, hex: hub.hex, sticker: hub.sticker as StickerId } : null;
    if (!look) return [];
    return [{ megaId: m.megaId, ...look, station: m.station as Station, label: m.label, busy: m.busy, mine: m.megaId === viewer?.mega?._id, ownerId: owner?.member._id }];
  });
  const doors = (members ?? []).slice(0, 3).map((m) => ({ memberId: m.member._id as string, name: m.member.name, mine: m.member._id === viewer?.member._id }));
  const busy = room.megas.filter((m) => m.busy).length;
  const time = now !== undefined && viewer ? new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: viewer.family.timezone }) : '';
  const sub = busy === 0 ? fillCopy(G5_UI_COPY.hqSubIdle, { time }) : busy === 1 ? fillCopy(G5_UI_COPY.hqSubOne, { time }) : fillCopy(G5_UI_COPY.hqSub, { n: busy, time });

  return (
    <Screen scroll presentation="tab">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, marginBottom: tokens.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="headline">{G5_UI_COPY.hqTitle}</Text>
          {time ? <Text color="muted">{sub}</Text> : null}
        </View>
        {viewer ? <Button label={G5_UI_COPY.myRoom} variant="secondary" pill onPress={() => router.push(`/hq/${viewer.member._id}` as never)} /> : null}
      </View>
      <HqRoom
        megas={megas}
        doors={doors}
        narration={room.narration}
        width={width}
        onTalk={() => router.push('/chat' as never)}
        onDetails={() => router.push('/mega-profile' as never)}
        onVisitRoom={(id) => router.push(`/hq/${id}` as never)}
        onPlaceAction={(station) => router.push((station === 'calendar' ? '/family/calendar' : station === 'fridge' ? '/family/lists' : '/chat') as never)}
      />
    </Screen>
  );
}
