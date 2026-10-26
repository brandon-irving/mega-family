// HQ placeholder (G1 scope item 9 — the full tile-room render is a later gate). Reads hq.room so
// navigation and data plumbing are complete even before the room is drawn.
import { useLocalSearchParams } from 'expo-router';
import { useHqRoom } from '@/data/useHq';
import { Screen } from '@/ui/Screen';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export default function HqRoute() {
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const tokens = useTokens();
  const room = useHqRoom(memberId as never);

  if (room === undefined) return <LoadingScreen label="Opening HQ…" />;

  return (
    <Screen scroll>
      <Text variant="headline" style={{ marginBottom: tokens.spacing.md }}>
        {memberId ? 'My room' : 'HQ'}
      </Text>
      {room ? (
        <>
          <Text color="muted" style={{ marginBottom: tokens.spacing.lg }}>
            {room.narration}
          </Text>
          {room.megas.map((m) => (
            <Text key={m.megaId} style={{ marginBottom: tokens.spacing.xs }}>
              At the {m.station} · {m.busy ? m.label : 'Available'}
            </Text>
          ))}
        </>
      ) : (
        <Text color="muted">The room (tile map, walking MEGAs, stations) arrives in a later milestone.</Text>
      )}
    </Screen>
  );
}
