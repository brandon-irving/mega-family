import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { BlockAnswer, UIBlock } from '@shared/domain/messages';
import { Button } from './Button';
import { Text } from './Text';
import { useTokens } from './theme';

/** Shared field editor for chat forms and invitation setup. Defaults are copied once per form instance. */
export function FieldsForm({ block, onAnswer, busy = false }: { block: Extract<UIBlock, { kind: 'fields' }>; onAnswer: (answer: BlockAnswer) => void; busy?: boolean }) {
  const tokens = useTokens();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(block.fields.map(f => [f.id, f.value ?? ''])));
  return <View style={{ gap: tokens.spacing.sm }}>
    <Text variant="label">{block.prompt}</Text>
    {block.description ? <Text variant="caption" color="muted">{block.description}</Text> : null}
    {block.fields.map(f => <View key={f.id} style={{ gap: tokens.spacing.xs }}>
      <Text variant="caption" color="muted">{f.label}</Text>
      <TextInput value={values[f.id] ?? ''} onChangeText={text => setValues(current => ({ ...current, [f.id]: text }))}
        editable={!busy} keyboardType={f.type === 'number' ? 'number-pad' : 'default'} multiline={f.multiline} maxLength={f.maxLength}
        placeholder={f.placeholder} placeholderTextColor={tokens.muted} accessibilityLabel={f.label}
        style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget, textAlignVertical: 'top' }} />
    </View>)}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
      <Button label={block.skipLabel ?? 'Skip'} variant="ghost" disabled={busy} onPress={() => onAnswer({ skipped: true })} />
      <Button label={block.saveLabel ?? 'Save'} loading={busy} disabled={busy} onPress={() => onAnswer({ fields: values })} />
    </View>
  </View>;
}
