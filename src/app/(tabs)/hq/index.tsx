// HQ placeholder (G1 scope item 9 — the full tile-room render is a later gate). Reads hq.room so
// navigation and data plumbing are complete even before the room is drawn.
import { useLocalSearchParams } from 'expo-router';
import { useHqRoom } from '@/data/useHq';
import { useMegaDirectory } from '@/data/useMegaDirectory';
import { HqRoomList } from '@/features/hq/HqRoomList';
import { Screen } from '@/ui/Screen';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export default function HqRoute() {
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const tokens = useTokens();
  const room = useHqRoom(memberId as never);
  // G1 fix: `room.megas` is just `{ megaId, station, label, busy }` — enough to say "at the charger" but
  // not whose MEGA that is. `family.members` is already loaded family-wide data (DRY: no new backend
  // call), keyed by megaId, so HqRoomList can show each one's badge and name next to its status.
  const megaById = useMegaDirectory();

  if (room === undefined) return <LoadingScreen label="Opening HQ…" />;

  return (
    <Screen scroll>
      <Text variant="headline" style={{ marginBottom: tokens.spacing.md }}>
        {memberId ? 'My room' : 'HQ'}
      </Text>
      {room ? (
        <HqRoomList room={room} megaById={megaById} />
      ) : (
        <Text color="muted">The room (tile map, walking MEGAs, stations) arrives in a later milestone.</Text>
      )}
    </Screen>
  );
}
