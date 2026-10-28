// "Saved · Family" under a message. Tapping it opens a sheet to change scope or forget
// (memories.changeScope / memories.forget) — PLAN §1.
import { useState } from 'react';
import { View } from 'react-native';
import type { SaveChip as SaveChipDoc } from '@shared/domain/messages';
import type { Scope } from '@shared/domain/enums';
import { BottomSheetModal } from '@/ui/BottomSheetModal';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

const SCOPES: Scope[] = ['personal', 'family', 'adults', 'shared'];
const SCOPE_LABEL: Record<Scope, string> = { personal: 'Only me', family: 'Family', adults: 'Adults', shared: 'Shared' };

export type SaveChipProps = {
  chip: SaveChipDoc;
  onChangeScope: (scope: Scope) => void;
  onForget: () => void;
  /** Kids don't get sharing or memory controls (PLAN "MEGA profile") — the chip still shows what was
   * saved, but tapping it does nothing. */
  readOnly?: boolean;
};

export function SaveChip({ chip, onChangeScope, onForget, readOnly = false }: SaveChipProps) {
  const [open, setOpen] = useState(false);
  const tokens = useTokens();
  if (readOnly) return <Chip label={`Saved · ${chip.label}`} accessibilityLabel={`Saved, ${chip.label}`} />;
  return (
    <>
      <Chip label={`Saved · ${chip.label}`} onPress={() => setOpen(true)} accessibilityLabel={`Saved, ${chip.label}. Tap to change.`} />
      {/* Closes with its ✕, the scrim, a drag down, Android back or Escape (src/ui/BottomSheetModal). */}
      <BottomSheetModal open={open} onClose={() => setOpen(false)} label="Change scope">
        <Text variant="title" style={{ marginBottom: tokens.spacing.sm }}>
          Change scope
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, marginBottom: tokens.spacing.md }}>
          {SCOPES.map((s) => (
            <Chip
              key={s}
              label={SCOPE_LABEL[s]}
              selected={s === chip.scope}
              onPress={() => {
                onChangeScope(s);
                setOpen(false);
              }}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          <Button
            label="Forget this"
            variant="secondary"
            onPress={() => {
              onForget();
              setOpen(false);
            }}
          />
          <Button label="Close" variant="ghost" onPress={() => setOpen(false)} />
        </View>
      </BottomSheetModal>
    </>
  );
}
