// Board EventPlace: pick a saved place for an event (sets `placeId`, which gets travel time and weather) or keep
// the typed-in text (`placeId` cleared). A bottom sheet with a Close control, closable every way (ModalSheet).
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { G4_COPY } from '@shared/config/copy';
import { ModalSheet } from '@/ui/ModalSheet';
import { Text } from '@/ui/Text';
import { CardActions } from '@/ui/ThreadCard';
import { useTokens } from '@/ui/theme';
import type { PlaceDoc } from './types';

export type EventPlaceSheetProps = {
  open: boolean;
  event: { title: string; when: string; layer: string; placeId?: string | null; place?: string };
  places: PlaceDoc[];
  busy?: boolean;
  error?: string | null;
  /** The picked saved place, or null for "Type a place instead" (keeps the free text, clears placeId). */
  onSave: (placeId: string | null) => void;
  onClose: () => void;
};

const TEXT_ONLY = '__text';

export function EventPlaceSheet(props: EventPlaceSheetProps) {
  return props.open ? <EventPlaceBody key={props.event.title} {...props} /> : null;
}

function EventPlaceBody({ open, event, places, busy, error, onSave, onClose }: EventPlaceSheetProps) {
  const tokens = useTokens();
  const [pick, setPick] = useState<string>(event.placeId ?? TEXT_ONLY);
  const options = [
    ...places.map((p) => ({ id: p._id as string, label: p.label, sub: p.geocode.status === 'ok' || p.geocode.status === 'seed' ? G4_COPY.eventPlaceSaved : G4_COPY.eventPlaceSavedShort })),
    { id: TEXT_ONLY, label: G4_COPY.eventPlaceText, sub: event.place ? `${event.place} · ${G4_COPY.eventPlaceTextSub}` : G4_COPY.eventPlaceTextSub },
  ];
  return (
    <ModalSheet open={open} title={G4_COPY.eventPlaceTitle} closeLabel={G4_COPY.close} onClose={onClose} testID="event-place-sheet">
      <View style={{ gap: 4, borderRadius: tokens.radii.lg, backgroundColor: tokens.bg, borderWidth: 1, borderColor: tokens.line, paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md }}>
        <Text variant="label">{event.title}</Text>
        <Text variant="caption" color="muted">
          {event.when} · {event.layer}
        </Text>
      </View>
      <Text variant="label" color="muted">
        {G4_COPY.eventPlaceWhere}
      </Text>
      {places.length === 0 ? <Text color="muted">{G4_COPY.eventPlaceAddFirst}</Text> : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={G4_COPY.eventPlaceWhere} style={{ gap: tokens.spacing.sm }}>
        {options.map((o) => {
          const on = o.id === pick;
          return (
            <Pressable
              key={o.id}
              onPress={() => setPick(o.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, minHeight: 52, borderRadius: tokens.radii.lg, borderWidth: 1, borderColor: on ? tokens.household : tokens.line, backgroundColor: on ? tokens.householdSurface : tokens.bg, paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? tokens.household : tokens.muted, alignItems: 'center', justifyContent: 'center' }}>
                {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.household }} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text variant="label">{o.label}</Text>
                <Text variant="caption" color="muted" numberOfLines={1}>
                  {o.sub}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" color="muted">
        {G4_COPY.eventPlaceFoot}
      </Text>
      {error ? (
        <Text variant="label" style={{ color: tokens.warn }}>
          {error}
        </Text>
      ) : null}
      <CardActions cols={1} actions={[{ id: 'save', label: G4_COPY.eventPlaceSave, loading: busy, onPress: () => onSave(pick === TEXT_ONLY ? null : pick) }]} />
    </ModalSheet>
  );
}
