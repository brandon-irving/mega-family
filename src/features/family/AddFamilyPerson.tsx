import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { AGE_GROUPS, AGE_GROUP_LABELS, type AgeGroup } from '@shared/ageGroups';
import { FAMILY_EDITOR as C } from '@shared/config/familyEditor';
import { ONBOARDING } from '@shared/config/onboarding';
import type { Relationship } from '@shared/domain/enums';
import { useAddFamilyMember } from '@/data/useFamily';
import { errorCopyFor } from '@/data/errorCopy';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
export function AddFamilyPerson({ onDone, onCreateMega }: { onDone: () => void; onCreateMega: () => void }) {
  const t = useTokens();
  const add = useAddFamilyMember();
  const lock = useRef(false);
  const [mode, setMode] = useState(false);
  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!mode) return <><Text color="muted">{C.description}</Text><Button label={C.contextOnly} onPress={() => setMode(true)} /><Button label={C.createMega} variant="secondary" onPress={onCreateMega} /></>;
  return <>
    <Text color="muted">{C.description}</Text>
    <TextInput accessibilityLabel={C.name} placeholder={C.name} placeholderTextColor={t.muted} value={name} onChangeText={setName} maxLength={ONBOARDING.nameMaxLength} editable={!busy} style={{ color: t.text, fontSize: t.type.body.fontSize, minHeight: t.touchTarget, borderColor: t.line, borderWidth: 1, borderRadius: t.radii.md, padding: t.spacing.sm }} />
    <Text variant="label">{C.age}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>{AGE_GROUPS.map(g => <Chip key={g} label={AGE_GROUP_LABELS[g]} selected={ageGroup === g} onPress={() => !busy && setAgeGroup(g)} />)}</View>
    <Text variant="label">{C.relationship}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>{C.relationships.map(r => <Chip key={r.id} label={r.label} selected={relationship === r.id} onPress={() => !busy && setRelationship(r.id)} />)}</View>
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <Button label={C.save} loading={busy} disabled={!name.trim() || !ageGroup || !relationship || busy} onPress={async () => {
      if (lock.current || !ageGroup || !relationship) return;
      lock.current = true; setBusy(true); setError('');
      try { await add({ name: name.trim(), role: ageGroup === 'adult' ? 'adult' : 'kid', ageGroup, relationship }); onDone(); }
      catch (e) { setError(errorCopyFor(e)); }
      finally { lock.current = false; setBusy(false); }
    }} />
  </>;
}
