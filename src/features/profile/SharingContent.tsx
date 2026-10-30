import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { ShareLevel } from '@shared/domain/enums';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { errorCopyFor } from '@/data/errorCopy';
import type { Sharing } from './ProfileContent';

const LEVELS: { id: ShareLevel; label: string }[] = [{ id: 'me', label: 'Only me' }, { id: 'partner', label: 'Partner' }, { id: 'family', label: 'Family' }];
const FIELDS: { id: keyof Sharing; label: string }[] = [{ id: 'schedule', label: 'Schedule' }, { id: 'lists', label: 'Lists' }, { id: 'hqActivity', label: 'HQ activity' }];

export function SharingContent({ sharing, onSave }: { sharing: Sharing; onSave: (value: Sharing) => Promise<unknown> }) {
  const tokens = useTokens();
  const [draft, setDraft] = useState(sharing);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    setNote(null);
    try { await onSave(draft); setNote('Sharing preferences saved.'); }
    catch (err) { setError(errorCopyFor(err)); }
    finally { saving.current = false; setBusy(false); }
  };
  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <Text color="muted">Choose who your MEGA shares these updates with. Your private chat stays private.</Text>
      {FIELDS.map(({ id, label }) => (
        <View key={id} style={{ gap: tokens.spacing.sm }}>
          <Text variant="label">{label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
            {LEVELS.map((level) => <Chip key={level.id} label={level.label} accessibilityLabel={`${label}: ${level.label}`} selected={draft[id] === level.id} onPress={busy ? undefined : () => { setNote(null); setDraft((old) => ({ ...old, [id]: level.id })); }} />)}
          </View>
        </View>
      ))}
      {error ? <Text style={{ color: tokens.danger }} accessibilityRole="alert">{error}</Text> : null}
      {note ? <Text color="muted" accessibilityLiveRegion="polite">{note}</Text> : null}
      <Button label="Save sharing preferences" loading={busy} onPress={() => void save()} />
    </View>
  );
}
