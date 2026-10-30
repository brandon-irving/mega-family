// HQ (canvas Screen 2, board HQ). G5: the shared HQ is the pixel tile room with the family's MEGAs walking to
// the stations `hq.room` reports (src/features/hq/HqRoom.tsx), a header with how many are at work and "My room".
// A member's own room renders its saved furniture and lists its MEGA's current work.
// GD (Screen 11, boards StoreRoom / StoreTray): a kid's own room also shows the Store button with their
// balance, Decorate and Open the Store, and the Decorate tray (src/features/store/KidRoomPanel.tsx).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { router } from '@/features/shell/navigation';
import { AppState, Pressable, View } from 'react-native';
import { fillCopy, G5_UI_COPY, STORE_COPY } from '@shared/config/copy';
import { useHqRoom } from '@/data/useHq';
import { useMegaDirectory } from '@/data/useMegaDirectory';
import { useBucksBalance } from '@/data/useKids';
import { useStoreCatalog, useUpdateRoom } from '@/data/useStore';
import { useViewer } from '@/data/useViewer';
import { HqRoomList } from '@/features/hq/HqRoomList';
import { KidRoomPanel, type RoomDoc, trayPieces, type TrayPiece } from '@/features/store/KidRoomPanel';
import { PersonalRoom, furnitureSpot } from '@/features/hq/PersonalRoom';
import { AppSettingsButton } from '@/features/shell/AppSettingsButton';
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
import { TabBottomInset } from '@/ui/TabBottomInset';

export default function HqRoute() {
  return <TabBottomInset><HqContent /></TabBottomInset>;
}

function HqContent() {
  const { memberId, decorate } = useLocalSearchParams<{ memberId?: string; decorate?: string }>();
  const tokens = useTokens();
  const room = useHqRoom(memberId as never);
  const viewer = useViewer();
  // G1 fix: `room.megas` is just `{ megaId, station, label, busy }` — enough to say "at the charger" but
  // not whose MEGA that is. `family.members` is already loaded family-wide data (DRY: no new backend
  // call), keyed by megaId, so HqRoomList can show each one's badge and name next to its status.
  const megaById = useMegaDirectory();
  const ownKidRoom = !!memberId && viewer?.member._id === memberId && viewer.member.role === 'kid';
  const members = useFamilyMembers();
  const owner = members?.find((m) => m.member._id === memberId);
  const roomName = memberId === viewer?.member._id ? 'My room' : owner ? `${owner.member.name}’s room` : 'Room';

  if (room === undefined) return <LoadingScreen label="Opening HQ…" />;
  if (!memberId && room) return <SharedHq room={room} />;

  return (
    <Screen scroll presentation="tab">
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.md }}>
        {memberId ? <Button label="‹ HQ" variant="ghost" onPress={() => router.navigate('/hq' as never)} /> : null}
        <Text variant="title" style={{ flex: 1 }}>
          {memberId ? roomName : 'HQ'}
        </Text>
        {ownKidRoom && <StoreButton />}
        <AppSettingsButton />
      </View>
      {room ? (
        <View style={{ gap: tokens.spacing.md }}>
          <PersonalRoom room={room.room} name={roomName} mega={owner?.mega ? megaById[owner.mega._id] : undefined} />
          <HqRoomList room={room} megaById={megaById} />
        </View>
      ) : (
        <Text color="muted">This room isn’t available.</Text>
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
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const tray = catalog.status === 'ok' ? trayPieces(catalog.data.items, room) : [];
  const place = async (piece: TrayPiece) => {
    if (inFlight.current) return;
    if (room.furniture.some((f) => f.kind === piece.kind)) { setNote(`${piece.label} is already in your room.`); return; }
    const spot = furnitureSpot(room, piece.kind);
    if (!spot) { setNote(`There isn’t an open spot for ${piece.label.toLowerCase()} yet.`); return; }
    inFlight.current = true;
    setSaving(true);
    setNote(null);
    try {
      await updateRoom({ furniture: [...room.furniture, { kind: piece.kind, ...spot }] });
      setNote(`${piece.label} placed in your room.`);
    } catch {
      setNote(`Couldn’t place ${piece.label.toLowerCase()}. Please try again.`);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  return (
    <View style={{ marginTop: tokens.spacing.lg, marginHorizontal: -tokens.spacing.lg }}>
      <Text variant="caption" color="muted" style={{ marginHorizontal: tokens.spacing.lg, marginBottom: tokens.spacing.sm }}>
        {saving ? 'Placing furniture…' : decorating ? 'Tap a piece to place it in the next open spot.' : 'Decorate with furniture you own.'}
      </Text>
      {note ? <Text accessibilityLiveRegion="polite" style={{ marginHorizontal: tokens.spacing.lg, marginBottom: tokens.spacing.sm }}>{note}</Text> : null}
      <KidRoomPanel
        balance={balance.status === 'ok' ? balance.data.balance : null}
        decorating={decorating}
        tray={tray}
        onOpenStore={() => router.push('/store')}
        onDecorate={() => setDecorating(true)}
        onDone={() => setDecorating(false)}
        onPlace={(piece) => void place(piece)}
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
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);
  const [dismissSignal, setDismissSignal] = useState(0);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [footerHeight, setFooterHeight] = useState(tokens.touchTarget * 2 + tokens.spacing.md);
  // Header and native tab bar are outside this measured area. Leave space for Explore and the room links.
  const width = Math.max(0, Math.min(ROOM_MAX, bounds.width, (bounds.height - footerHeight - tokens.spacing.md) / 1.3));
  const owners = new Map((members ?? []).filter((m) => m.mega).map((m) => [m.mega!._id as string, m]));

  const built: RoomMega[] = room.megas.flatMap((m) => {
    const owner = owners.get(m.megaId);
    const look = owner?.mega ? { name: owner.mega.name, hex: owner.mega.look.hex, sticker: owner.mega.look.sticker as StickerId } : hub && hub.megaId === m.megaId ? { name: hub.name, hex: hub.hex, sticker: hub.sticker as StickerId } : null;
    if (!look) return [];
    return [{ megaId: m.megaId, ...look, station: m.station as Station, label: m.label, busy: m.busy, mine: m.megaId === viewer?.mega?._id, ownerId: owner?.member._id }];
  });
  // Same content → same array (G5 review): this screen re-renders on every clock tick, and HqRoom's walkers
  // shouldn't see a "new" family each time.
  const megasKey = JSON.stringify(built);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not identity
  const megas = useMemo(() => built, [megasKey]);
  // Every member gets a room: the first ones on the art's doors, all of them in HqRoom's Rooms row.
  const doors = (members ?? []).map((m) => ({ memberId: m.member._id as string, name: m.member.name, mine: m.member._id === viewer?.member._id }));
  const busy = room.megas.filter((m) => m.busy).length;
  const time = now !== undefined && viewer ? new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: viewer.family.timezone }) : '';
  const sub = busy === 0 ? `A little downtime · ${time}` : busy === 1 ? fillCopy(G5_UI_COPY.hqSubOne, { time }) : fillCopy(G5_UI_COPY.hqSub, { n: busy, time });

  return (
    <Screen presentation="tab">
      <View style={{ flex: 1 }} onTouchStart={() => setDismissSignal(value => value + 1)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, marginBottom: tokens.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{G5_UI_COPY.hqTitle}</Text>
          {time ? <Text variant="caption" color="muted">{sub}</Text> : null}
        </View>
        {viewer ? <Button label={G5_UI_COPY.myRoom} variant="secondary" pill onPress={() => router.push(`/hq/${viewer.member._id}` as never)} /> : null}
        <AppSettingsButton />
      </View>
      <View style={{ flex: 1 }} onLayout={(e) => setBounds({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {width > 0 ?
      <HqRoom
        dismissSignal={dismissSignal}
        megas={megas}
        doors={doors}
        narration={busy === 0 ? 'Your MEGAs are exploring HQ.' : room.narration}
        width={width}
        onFooterHeight={setFooterHeight}
        active={focused && foreground}
        ideasAvailable={!!viewer && viewer.member.role !== 'kid'}
        onTalk={() => router.push('/chat' as never)}
        onDetails={() => router.push('/mega-profile' as never)}
        onVisitRoom={(id) => router.push(`/hq/${id}` as never)}
        onPlaceAction={(station) => router.push((station === 'calendar' ? '/family/calendar' : station === 'fridge' ? '/family/lists' : station === 'bookshelf' ? '/ideas' : '/chat') as never)}
      />
      : null}
      </View>
      </View>
    </Screen>
  );
}
