// Board Places / PlacesKid: the family's saved places (household data) with each one's map status, plus the
// add/edit sheet (board PlaceSheet). Adults add, edit and remove; kids see the same list read-only, "Set by a
// grown-up" (the server enforces it too: places.upsert/remove are FORBIDDEN for kids). Pure views; the route
// (src/app/places.tsx) wires them to `places.*`.
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { G4_COPY, G4B_UI_COPY, fillCopy } from '@shared/config/copy';
import { PLACES } from '@shared/config/integrations';
import { ModalSheet } from '@/ui/ModalSheet';
import { Text } from '@/ui/Text';
import { LockNote, type CardAction, CardActions } from '@/ui/ThreadCard';
import { useTokens, type Tokens } from '@/ui/theme';
import { Glyph, PLACE_GLYPH, type PlaceKind } from './glyphs';
import type { PlaceDoc } from './types';

type GeocodeStatus = PlaceDoc['geocode']['status'];

export function placeTint(tokens: Tokens, kind: PlaceKind): { fg: string; bg: string } {
  if (kind === 'home') return { fg: tokens.accent, bg: tokens.bg };
  if (kind === 'school') return { fg: tokens.hint, bg: tokens.hintSurface };
  if (kind === 'work') return { fg: tokens.danger, bg: tokens.dangerSurface };
  return { fg: tokens.warn, bg: tokens.warnSurface };
}

function statusColor(tokens: Tokens, status: GeocodeStatus): string {
  if (status === 'ok' || status === 'seed') return tokens.success;
  if (status === 'failed') return tokens.warn;
  return tokens.muted;
}

export type PlacesContentProps = { places: PlaceDoc[]; canEdit: boolean; onAdd: () => void; onEdit: (place: PlaceDoc) => void };

export function PlacesContent({ places, canEdit, onAdd, onEdit }: PlacesContentProps) {
  const tokens = useTokens();
  return (
    <View style={{ gap: tokens.spacing.md }}>
      <Text color="muted">{canEdit ? G4_COPY.placesIntro : G4_COPY.placesIntroKid}</Text>
      {places.length === 0 ? <Text color="muted">{canEdit ? G4_COPY.placesNone : G4_COPY.placesNoneKid}</Text> : null}
      <View style={{ gap: tokens.spacing.sm }}>
        {places.map((p) => {
          const tint = placeTint(tokens, p.kind);
          const sc = statusColor(tokens, p.geocode.status);
          return (
            <View key={p._id} testID={`place-${p._id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, minHeight: 64, borderRadius: tokens.radii.lg, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.line, paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md }}>
              <View style={{ width: 40, height: 40, borderRadius: tokens.radii.md, backgroundColor: tint.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={PLACE_GLYPH[p.kind]} color={tint.fg} size={20} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="label">{p.label}</Text>
                <Text variant="caption" color="muted" numberOfLines={1}>
                  {p.address}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sc }} />
                  <Text variant="caption" weight="600" style={{ color: sc, flexShrink: 1 }}>
                    {G4_COPY.placeStatus[p.geocode.status]}
                  </Text>
                </View>
              </View>
              {canEdit ? (
                <Pressable
                  onPress={() => onEdit(p)}
                  accessibilityRole="button"
                  accessibilityLabel={fillCopy(G4_COPY.placesEditLabel, { label: p.label })}
                  style={{ minHeight: tokens.touchTarget, paddingHorizontal: tokens.spacing.md, borderRadius: tokens.radii.pill, borderWidth: 1, borderColor: tokens.line, justifyContent: 'center' }}
                >
                  <Text variant="label" numberOfLines={1}>
                    {G4_COPY.placesEdit}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
      {canEdit ? (
        places.length < PLACES.maxPerFamily ? (
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={G4_COPY.placesAdd}
            style={{ minHeight: 52, borderRadius: tokens.radii.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: tokens.muted, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.sm }}
          >
            <Glyph name="plus" color={tokens.text} size={18} stroke={2.4} />
            <Text variant="label">{G4_COPY.placesAdd}</Text>
          </Pressable>
        ) : null
      ) : (
        <LockNote text={G4_COPY.placesReadOnly} />
      )}
      <LockNote text={G4_COPY.placesFoot} />
    </View>
  );
}

/** Board gap (G4b): PlaceSheet has no Outdoor row on the canvas. Drawn like the sheet's other rows: a full-width
 * 52pt row with the label and its hint, and a switch-style pill on the right (accessibilityRole "switch"). */
function OutdoorSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={() => onChange(!on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={G4B_UI_COPY.placeOutdoor}
      accessibilityHint={G4B_UI_COPY.placeOutdoorHint}
      style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, minHeight: 52, borderRadius: tokens.radii.lg, borderWidth: 1, borderColor: tokens.line, backgroundColor: tokens.bg, paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="label">{G4B_UI_COPY.placeOutdoor}</Text>
        <Text variant="caption" color="muted">
          {G4B_UI_COPY.placeOutdoorHint}
        </Text>
      </View>
      <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: on ? tokens.accent : tokens.line, alignItems: on ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: on ? tokens.onAccent : tokens.muted }} />
      </View>
    </Pressable>
  );
}

/** G4b (CONTRACT v0.16 `places.upsert` `outdoor`): events at an outdoor place get UV and air-quality tips. */
export type PlaceDraft = { kind: PlaceKind; label: string; address: string; outdoor: boolean };

export type PlaceSheetProps = {
  open: boolean;
  /** The place being edited, or null to add a new one. */
  place: PlaceDoc | null;
  /** True when another place is already Home (`places.upsert` allows one). */
  hasHome: boolean;
  busy?: boolean;
  error?: string | null;
  onSave: (draft: PlaceDraft) => void;
  onRemove: () => void;
  onClose: () => void;
};

export function PlaceSheet(props: PlaceSheetProps) {
  // Keyed on the place so the form starts fresh each time it opens for a different place.
  return props.open ? <PlaceSheetBody key={props.place?._id ?? 'new'} {...props} /> : null;
}

function PlaceSheetBody({ open, place, hasHome, busy, error, onSave, onRemove, onClose }: PlaceSheetProps) {
  const tokens = useTokens();
  const [kind, setKind] = useState<PlaceKind>(place?.kind ?? (hasHome ? 'school' : 'home'));
  const [label, setLabel] = useState(place?.label ?? PLACES.labels[place?.kind ?? (hasHome ? 'school' : 'home')]);
  const [address, setAddress] = useState(place?.address ?? '');
  const [outdoor, setOutdoor] = useState(place?.outdoor ?? false);
  const [touched, setTouched] = useState(false);
  const missing = !label.trim() ? G4_COPY.placeNeedName : !address.trim() ? G4_COPY.placeNeedAddress : null;
  const kinds = PLACES.kinds.filter((k) => k !== 'home' || !hasHome || place?.kind === 'home');

  const pickKind = (k: PlaceKind) => {
    // A label still at the old kind's default follows the new kind ("School" → "Work"); a typed one stays.
    if (!label.trim() || label === PLACES.labels[kind]) setLabel(PLACES.labels[k]);
    setKind(k);
  };
  const save = () => {
    setTouched(true);
    if (!missing) onSave({ kind, label: label.trim().slice(0, PLACES.maxLabelLength), address: address.trim().slice(0, PLACES.maxAddressLength), outdoor });
  };
  const actions: CardAction[] = [
    ...(place ? [{ id: 'remove', label: G4_COPY.placeRemove, variant: 'ghost' as const, onPress: onRemove, disabled: busy }] : []),
    { id: 'save', label: G4_COPY.placeSave, onPress: save, loading: busy },
  ];
  const input = { minHeight: 52, borderRadius: tokens.radii.lg, borderWidth: 1, borderColor: tokens.line, backgroundColor: tokens.bg, color: tokens.text, paddingHorizontal: tokens.spacing.md, fontSize: tokens.type.body.fontSize };

  return (
    <ModalSheet open={open} title={place ? G4_COPY.placeSheetEdit : G4_COPY.placeSheetAdd} closeLabel={G4_COPY.close} onClose={onClose} testID="place-sheet">
      <View style={{ gap: 6 }}>
        <Text variant="label" color="muted" nativeID="place-label">
          {G4_COPY.placeName}
        </Text>
        <TextInput value={label} onChangeText={setLabel} maxLength={PLACES.maxLabelLength} accessibilityLabel={G4_COPY.placeName} style={input} placeholderTextColor={tokens.muted} />
      </View>
      <View style={{ gap: 6 }}>
        <Text variant="label" color="muted">
          {G4_COPY.placeKind}
        </Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={G4_COPY.placeKind} style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          {kinds.map((k) => {
            const on = k === kind;
            return (
              <Pressable
                key={k}
                onPress={() => pickKind(k)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={G4_COPY.placeKinds[k]}
                style={{ flex: 1, minHeight: tokens.touchTarget, borderRadius: tokens.radii.lg, borderWidth: 1, borderColor: on ? tokens.text : tokens.line, backgroundColor: on ? tokens.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text variant="label" numberOfLines={1} style={{ color: on ? tokens.bg : tokens.text }}>
                  {G4_COPY.placeKinds[k]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text variant="label" color="muted">
          {G4_COPY.placeAddress}
        </Text>
        <TextInput value={address} onChangeText={setAddress} maxLength={PLACES.maxAddressLength} accessibilityLabel={G4_COPY.placeAddress} style={input} placeholderTextColor={tokens.muted} autoCapitalize="words" />
        {place && place.address === address.trim() ? (
          <Text variant="caption" style={{ color: statusColor(tokens, place.geocode.status) }}>
            {G4_COPY.placeStatus[place.geocode.status]}
          </Text>
        ) : null}
      </View>
      <OutdoorSwitch on={outdoor} onChange={setOutdoor} />
      {touched && missing ? (
        <Text variant="label" style={{ color: tokens.warn }}>
          {missing}
        </Text>
      ) : null}
      {error ? (
        <Text variant="label" style={{ color: tokens.warn }}>
          {error}
        </Text>
      ) : null}
      <CardActions actions={actions} />
    </ModalSheet>
  );
}
