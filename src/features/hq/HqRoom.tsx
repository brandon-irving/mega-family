// HQ (canvas Screen 2, board HQ; G5 replaces the G1 list placeholder): the family's pixel tile room, with every
// MEGA walking from the charger to the station `hq.room` says it's at (desk, calendar, fridge, mailbox, …) and
// standing there facing its work. Tap a MEGA → its name and status, with Talk / Details for your own and Visit
// room for anyone else's; tap a station → what happens there and a shortcut (chat, calendar, lists); tap a door
// on the bottom wall → that person's room. Below the room, the narration line says what's going on. The MEGAs
// walk on the room art only (the room is their stage, so they never cover the page's content), step on the same
// walk frames as the sign-in walkers (`MegaSprite` stand / stepL / stepR), and stand still at their stations
// under reduced motion. Presentational: the route passes the room, the MEGAs' looks and the door owners.
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View, type ImageStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { Station } from '@shared/domain/enums';
import { G5_FIX_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import type { StickerId } from '@shared/config/looks';
import type { FrameName } from '@shared/sprite';
import { Button } from '@/ui/Button';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { HQ_LAYOUT, faceToward, isWalkable, route, type Face, type Tile } from './hqLayout';

const ROOM_ART = require('../../../assets/images/hq/hq_room.png');
/** One tile step every this many ms while walking. */
const STEP_MS = 260;
const START: Tile = HQ_LAYOUT.stations.charger.tile;

export type RoomMega = { megaId: string; name: string; hex: string; sticker: StickerId; station: Station; label: string; busy: boolean; mine: boolean; /** Whose MEGA it is (none for the family MEGA). */ ownerId?: string };
export type RoomDoor = { memberId: string; name: string; mine: boolean };
type Box = { kind: 'narrate' } | { kind: 'mega'; id: string } | { kind: 'place'; id: Station };

/** Each MEGA's target tile: its station, or the nearest free walkable tile around it when another MEGA is there
 * (G5 review: a family resting at the charger used to stack on the same few tiles). Nearest first, and along the
 * station's own row before the rows above and below, so sprites taller than a tile don't stand on each other. */
export function targetTiles(megas: Pick<RoomMega, 'megaId' | 'station'>[]): Record<string, Tile> {
  const taken = new Set<string>();
  const out: Record<string, Tile> = {};
  const id = (t: Tile) => `${t[0]},${t[1]}`;
  for (const m of megas) {
    const base = HQ_LAYOUT.stations[m.station].tile;
    const options: Tile[] = [];
    for (let dy = -HQ_LAYOUT.rows; dy <= HQ_LAYOUT.rows; dy++) for (let dx = -HQ_LAYOUT.cols; dx <= HQ_LAYOUT.cols; dx++) options.push([base[0] + dx, base[1] + dy]);
    options.sort((a, b) => Math.abs(a[1] - base[1]) - Math.abs(b[1] - base[1]) || Math.abs(a[0] - base[0]) - Math.abs(b[0] - base[0]));
    const pick = options.find((t) => isWalkable(t) && !taken.has(id(t))) ?? base;
    taken.add(id(pick));
    out[m.megaId] = pick;
  }
  return out;
}

type Walker = { path: Tile[]; at: number; face: Face; frame: FrameName };

/** Walks every MEGA along its route, one tile per STEP_MS; `still` puts them straight at their targets. */
function useWalkers(megas: RoomMega[], still: boolean): Record<string, { tile: Tile; face: Face; frame: FrameName; walking: boolean }> {
  const key = `${megas.map((m) => `${m.megaId}:${m.station}`).join('|')}#${still}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on who stands where, not the array's identity
  const targets = useMemo(() => targetTiles(megas), [key]);
  // Re-plan only when who stands where changes (React's "adjust state when a prop changes" pattern: a guarded
  // setState during render, no effect round trip). Each MEGA sets off from where it stands now.
  const [plan, setPlan] = useState<{ key: string; walkers: Record<string, Walker> }>({ key: '', walkers: {} });
  if (plan.key !== key) {
    const next: Record<string, Walker> = {};
    for (const m of megas) {
      const target = targets[m.megaId];
      const prev = plan.walkers[m.megaId];
      const from = prev ? prev.path[prev.at] : START;
      const path = still ? [target] : (route(from, target) ?? [target]);
      next[m.megaId] = { path, at: 0, face: path.length > 1 ? faceToward(path[0], path[1]) : HQ_LAYOUT.stations[m.station].face, frame: 'stand' };
    }
    setPlan({ key, walkers: next });
  }
  const walkers = plan.walkers;
  // The step timer restarts only when who stands where changes (the key), not on every re-render that hands over
  // an equal list (G5 review: the clock query ticking tore it down). Stations by MEGA, rebuilt with the key.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on who stands where, not the array's identity
  const stationOf = useMemo(() => new Map(megas.map((m) => [m.megaId, m.station])), [key]);

  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => {
      setPlan(({ key: planKey, walkers: cur }) => {
        let moved = false;
        const out: Record<string, Walker> = {};
        for (const [id, w] of Object.entries(cur)) {
          if (w.at >= w.path.length - 1) {
            out[id] = w;
            continue;
          }
          moved = true;
          const at = w.at + 1;
          const done = at >= w.path.length - 1;
          const station = stationOf.get(id);
          out[id] = {
            path: w.path,
            at,
            face: done ? (station ? HQ_LAYOUT.stations[station].face : 'front') : faceToward(w.path[at], w.path[at + 1]),
            frame: done ? 'stand' : at % 2 ? 'stepL' : 'stepR',
          };
        }
        return moved ? { key: planKey, walkers: out } : { key: planKey, walkers: cur };
      });
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [still, stationOf]);

  const out: Record<string, { tile: Tile; face: Face; frame: FrameName; walking: boolean }> = {};
  for (const m of megas) {
    const w = walkers[m.megaId];
    const tile = w ? w.path[Math.min(w.at, w.path.length - 1)] : still ? targets[m.megaId] : START;
    out[m.megaId] = { tile, face: w?.face ?? 'front', frame: w?.frame ?? 'stand', walking: !!w && w.at < w.path.length - 1 };
  }
  return out;
}

export function HqRoom({
  megas,
  doors,
  narration,
  width,
  onTalk,
  onDetails,
  onVisitRoom,
  onPlaceAction,
}: {
  megas: RoomMega[];
  doors: RoomDoor[];
  narration: string;
  /** The room's on-screen width; the art scales to it (pixel-crisp). */
  width: number;
  onTalk: () => void;
  onDetails: () => void;
  onVisitRoom: (memberId: string) => void;
  onPlaceAction: (station: Station) => void;
}) {
  const tokens = useTokens();
  const reduced = useReducedMotion();
  const [box, setBox] = useState<Box>({ kind: 'narrate' });
  const walkers = useWalkers(megas, reduced);
  const T = HQ_LAYOUT.tile;
  const S = width / (HQ_LAYOUT.cols * T);
  const height = HQ_LAYOUT.rows * T * S;
  const px = (tiles: number) => tiles * T * S;
  const pixelated = { imageRendering: 'pixelated' } as unknown as ImageStyle;
  const selected = box.kind === 'mega' ? megas.find((m) => m.megaId === box.id) : undefined;
  const place = box.kind === 'place' ? box.id : undefined;
  const placeAction: Partial<Record<Station, string>> = { desk: U.openChat, mailbox: U.openChat, calendar: U.openCalendar, fridge: U.openLists };

  const statusOf = (m: RoomMega) => {
    const w = walkers[m.megaId];
    if (w?.walking) return fillCopy(U.walkingTo, { station: HQ_LAYOUT.stations[m.station].label.toLowerCase() });
    return `${HQ_LAYOUT.stations[m.station].label} · ${m.busy ? m.label : U.available}`;
  };

  return (
    <View style={{ gap: tokens.spacing.md }}>
      <View style={{ width, height, borderRadius: tokens.radii.lg, overflow: 'hidden', alignSelf: 'center' }} testID="hq-room">
        <Image source={ROOM_ART} style={[{ width, height }, pixelated]} resizeMode="stretch" accessibilityIgnoresInvertColors accessible={false} />
        {(Object.keys(HQ_LAYOUT.stations) as Station[]).map((id) => {
          const [x, y, w, h] = HQ_LAYOUT.stations[id].hit;
          const on = place === id;
          return (
            <Pressable
              key={id}
              onPress={() => setBox({ kind: 'place', id })}
              accessibilityRole="button"
              accessibilityLabel={HQ_LAYOUT.stations[id].label}
              style={{ position: 'absolute', left: px(x), top: px(y), width: Math.max(px(w), 44), height: Math.max(px(h), 44), borderRadius: tokens.radii.sm, backgroundColor: on ? tokens.scrim : 'transparent' }}
            />
          );
        })}
        {HQ_LAYOUT.doors.slice(0, doors.length).map((tile, i) => {
          const d = doors[i];
          return (
            <Pressable
              key={d.memberId}
              onPress={() => onVisitRoom(d.memberId)}
              // A tap target on the art only: screen readers get each room once, from the Rooms row below.
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={{ position: 'absolute', left: px(tile[0]), top: px(tile[1]), width: Math.max(px(1), 44), height: Math.max(px(1), 44) }}
            />
          );
        })}
        {[...megas]
          .sort((a, b) => walkers[a.megaId].tile[1] - walkers[b.megaId].tile[1])
          .map((m) => {
            const w = walkers[m.megaId];
            const view = selected?.megaId === m.megaId ? 'front' : w.face;
            return (
              <Pressable
                key={m.megaId}
                onPress={() => setBox({ kind: 'mega', id: m.megaId })}
                accessibilityRole="button"
                accessibilityLabel={`${m.name}, ${statusOf(m)}`}
                style={{ position: 'absolute', left: px(w.tile[0]), top: px(w.tile[1]) - (40 - 32 + 6) * S, minWidth: 44, minHeight: 44, alignItems: 'center' }}
              >
                <MegaSprite hex={m.hex} sticker={m.sticker} view={view} frame={w.frame} scale={S} accessibilityLabel={m.name} />
              </Pressable>
            );
          })}
      </View>

      <View style={{ minHeight: 96, padding: tokens.spacing.lg, borderRadius: tokens.radii.xl, borderWidth: 1, borderColor: tokens.line, backgroundColor: tokens.surface, gap: tokens.spacing.sm }} accessibilityLiveRegion="polite" testID="hq-box">
        {selected ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text variant="title">{selected.name}</Text>
                <Text color="muted">{statusOf(selected)}</Text>
                {!selected.mine && !selected.ownerId ? <Text color="muted">{fillCopy(G5_FIX_COPY.hubAbout, { name: selected.name })}</Text> : null}
              </View>
              <Button label={U.close} variant="ghost" onPress={() => setBox({ kind: 'narrate' })} />
            </View>
            <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
              {selected.mine ? (
                <>
                  <Button label={U.talk} onPress={onTalk} style={{ flex: 1 }} />
                  <Button label={U.details} variant="secondary" onPress={onDetails} style={{ flex: 1 }} />
                </>
              ) : selected.ownerId ? (
                <Button label={U.visitRoom} variant="secondary" onPress={() => onVisitRoom(selected.ownerId!)} style={{ flex: 1 }} />
              ) : (
                <Button label={fillCopy(G5_FIX_COPY.hubTalk, { name: selected.name })} onPress={onTalk} style={{ flex: 1 }} />
              )}
            </View>
          </>
        ) : place ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text variant="title">{HQ_LAYOUT.stations[place].label}</Text>
                <Text color="muted">{U.stationText[place]}</Text>
              </View>
              <Button label={U.close} variant="ghost" onPress={() => setBox({ kind: 'narrate' })} />
            </View>
            {placeAction[place] ? <Button label={placeAction[place]!} variant="secondary" onPress={() => onPlaceAction(place)} style={{ alignSelf: 'stretch' }} /> : null}
          </>
        ) : (
          <Text>{narration}</Text>
        )}
      </View>

      {doors.length > 0 ? (
        <View style={{ gap: tokens.spacing.sm }}>
          <Text variant="label" color="muted">
            {G5_FIX_COPY.rooms}
          </Text>
          {/* Every member's room, one tap away: the art has only HQ_LAYOUT.doors.length doors (one line, scrolls). */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: tokens.spacing.sm }}>
            {doors.map((d) => (
              <Button key={d.memberId} label={d.mine ? U.yourRoom : fillCopy(U.memberRoom, { name: d.name })} variant="secondary" pill onPress={() => onVisitRoom(d.memberId)} style={{ minHeight: 44 }} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
