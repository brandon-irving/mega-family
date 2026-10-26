// HQ placeholder's list of MEGAs (G1 scope item 9 — the full tile-room render is a later gate, G5).
// G1 fix: this used to read "At the charger · Available" with no way to tell whose MEGA that was —
// `hq.room` only returns `{ megaId, station, label, busy }` (CONTRACT §4), so the name/badge come from
// the family directory the app already has loaded (DRY: no new backend call). Presentational, like
// TodayContent/ChatThread — the route wires the data hooks.
import { View } from 'react-native';
import type { Infer } from 'convex/values';
import type { API } from '@shared/domain/api';
import type { MegaInfo } from '@/features/shell/megaInfo';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export type HqRoom = Infer<(typeof API)['hq']['room']['returns']>;

export function HqRoomList({ room, megaById }: { room: HqRoom; megaById: Record<string, MegaInfo> }) {
  const tokens = useTokens();
  return (
    <>
      <Text color="muted" style={{ marginBottom: tokens.spacing.lg }}>
        {room.narration}
      </Text>
      {room.megas.map((m) => {
        const mega = megaById[m.megaId];
        return (
          <View key={m.megaId} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, marginBottom: tokens.spacing.sm }}>
            {mega && <MegaBadge hex={mega.hex} sticker={mega.sticker} face={mega.face} size={32} accessibilityLabel={mega.name} />}
            <Text>
              {mega ? `${mega.name} — ` : ''}
              At the {m.station} · {m.busy ? m.label : 'Available'}
            </Text>
          </View>
        );
      })}
    </>
  );
}
