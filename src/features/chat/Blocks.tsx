// Renders every Thread UI block kind (CONTRACT §3 / PLAN "Thread UI blocks"): choice, toggle, text,
// number, date, fields, look, questions, invite, confirm. Pure presentational — takes the block and an
// onAnswer callback, so it's testable from fixtures and reusable from both chat and the kid thread.
import { useState } from 'react';
import { Switch, TextInput, View } from 'react-native';
import type { BlockAnswer, UIBlock } from '@shared/domain/messages';
import { COLORS, HEX_RE, PERSONALITIES } from '@shared/config/looks';
import { STICKERS } from '@shared/config/ids';
import type { Personality } from '@shared/domain/enums';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { MegaSprite } from '@/ui/MegaSprite';

export type BlockProps = { block: UIBlock; onAnswer: (answer: BlockAnswer) => void };

export function Block({ block, onAnswer }: BlockProps) {
  switch (block.kind) {
    case 'choice':
      return <ChoiceBlock block={block} onAnswer={onAnswer} />;
    case 'toggle':
      return <ToggleBlock block={block} onAnswer={onAnswer} />;
    case 'text':
      return <TextBlock block={block} onAnswer={onAnswer} />;
    case 'number':
      return <NumberBlock block={block} onAnswer={onAnswer} />;
    case 'date':
      return <DateBlock block={block} onAnswer={onAnswer} />;
    case 'fields':
      return <FieldsBlock block={block} onAnswer={onAnswer} />;
    case 'look':
      return <LookBlock block={block} onAnswer={onAnswer} />;
    case 'questions':
      return <QuestionsBlock block={block} onAnswer={onAnswer} />;
    case 'invite':
      return <InviteBlock block={block} />;
    case 'confirm':
      return <ConfirmBlock block={block} onAnswer={onAnswer} />;
  }
}

/** The collapsed view of an already-answered block (block.answeredWith set), shown as a plain reply. */
export function AnsweredBlock({ block, answer }: { block: UIBlock; answer: BlockAnswer }) {
  const tokens = useTokens();
  const label = summarizeAnswer(block, answer);
  return (
    <Text variant="body" style={{ color: tokens.muted, fontStyle: 'italic' }} accessibilityLabel={`Answered: ${label}`}>
      {label}
    </Text>
  );
}

export function summarizeAnswer(block: UIBlock, answer: BlockAnswer): string {
  if (answer.skipped) return 'Skipped';
  if (block.kind === 'choice' && answer.optionIds) {
    const labels = block.options.filter((o) => answer.optionIds!.includes(o.id)).map((o) => o.label);
    return [...labels, answer.other].filter(Boolean).join(', ') || 'No answer';
  }
  if (answer.fields) return Object.values(answer.fields).filter(Boolean).join(' · ') || 'No answer';
  if (answer.value !== undefined) return String(answer.value);
  return 'Answered';
}

function ChoiceBlock({ block, onAnswer }: { block: Extract<UIBlock, { kind: 'choice' }>; onAnswer: (a: BlockAnswer) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const tokens = useTokens();
  const toggle = (id: string) => {
    const next = block.multi ? (selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]) : [id];
    setSelected(next);
    if (!block.multi) onAnswer({ optionIds: next });
  };
  return (
    <Card>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        {block.prompt}
      </Text>
      {/* G3 review fix (HIGH, kid button sizes): sized from the viewer's role (tokens.buttonSize) and
          laid out 2-up like the design board's action-button grid — same treatment ButtonRow gives
          notification/request cards (DRY: both read the same shared/config/theme.ts BUTTON_SIZES). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
        {block.options.map((o) => (
          <Chip key={o.id} label={o.label} selected={selected.includes(o.id)} onPress={() => toggle(o.id)} size={tokens.buttonSize} style={{ flexBasis: '45%', flexGrow: 1, alignSelf: 'stretch' }} />
        ))}
      </View>
      {block.multi && <Button label="Done" variant="secondary" onPress={() => onAnswer({ optionIds: selected })} style={{ marginTop: tokens.spacing.sm }} />}
    </Card>
  );
}

function ToggleBlock({ block, onAnswer }: { block: Extract<UIBlock, { kind: 'toggle' }>; onAnswer: (a: BlockAnswer) => void }) {
  const [value, setValue] = useState(block.value);
  const tokens = useTokens();
  return (
    <Card>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        {block.prompt}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text>{block.label}</Text>
        <Switch
          value={value}
          onValueChange={(v) => {
            setValue(v);
            onAnswer({ value: v });
          }}
          trackColor={{ true: tokens.accent }}
          accessibilityLabel={block.label}
        />
      </View>
    </Card>
  );
}

function TextBlock({ block, onAnswer }: { block: Extract<UIBlock, { kind: 'text' }>; onAnswer: (a: BlockAnswer) => void }) {
  const [value, setValue] = useState('');
  const tokens = useTokens();
  return (
    <Card>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        {block.prompt}
      </Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={block.placeholder}
        placeholderTextColor={tokens.muted}
        style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget }}
        accessibilityLabel={block.prompt}
      />
      <Button label="Send" onPress={() => onAnswer({ value })} style={{ marginTop: tokens.spacing.sm }} disabled={!value} />
    </Card>
  );
}

function NumberBlock({ block, onAnswer }: { block: Extract<UIBlock, { kind: 'number' }>; onAnswer: (a: BlockAnswer) => void }) {
  const [value, setValue] = useState('');
  const tokens = useTokens();
  return (
    <Card>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        {block.prompt}
      </Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        keyboardType="number-pad"
        style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget }}
        accessibilityLabel={block.prompt}
      />
      <Button label="Send" onPress={() => onAnswer({ value: Number(value) })} style={{ marginTop: tokens.spacing.sm }} disabled={value === ''} />
    </Card>
  );
}

function DateBlock({ block, onAnswer }: { block: Extract<UIBlock, { kind: 'date' }>; onAnswer: (a: BlockAnswer) => void }) {
  const [value, setValue] = useState('');
  const tokens = useTokens();
  const placeholder = block.mode === 'time' ? 'HH:MM' : block.mode === 'datetime' ? 'YYYY-MM-DD HH:MM' : 'YYYY-MM-DD';
  return (
    <Card>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        {block.prompt}
      </Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={tokens.muted}
        style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget }}
        accessibilityLabel={block.prompt}
      />
      <Button label="Send" onPress={() => onAnswer({ value })} style={{ marginTop: tokens.spacing.sm }} disabled={!value} />
    </Card>
  );
}

function FieldsBlock({ block, onAnswer }: { block: Extract<UIBlock, { kind: 'fields' }>; onAnswer: (a: BlockAnswer) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const tokens = useTokens();
  return (
    <Card>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        {block.prompt}
      </Text>
      <View style={{ gap: tokens.spacing.sm }}>
        {block.fields.map((f) => (
          <View key={f.id}>
            <Text variant="caption" color="muted">
              {f.label}
            </Text>
            <TextInput
              value={values[f.id] ?? ''}
              onChangeText={(t) => setValues((v) => ({ ...v, [f.id]: t }))}
              keyboardType={f.type === 'number' ? 'number-pad' : 'default'}
              style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget }}
              accessibilityLabel={f.label}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, marginTop: tokens.spacing.sm }}>
        <Button label="Skip" variant="ghost" onPress={() => onAnswer({ skipped: true })} />
        <Button label="Save" onPress={() => onAnswer({ fields: values })} />
      </View>
    </Card>
  );
}

function LookBlock({ block, onAnswer }: { block: Extract<UIBlock, { kind: 'look' }>; onAnswer: (a: BlockAnswer) => void }) {
  const [hex, setHex] = useState(block.value?.hex ?? COLORS.teal);
  const [sticker, setSticker] = useState<string>(block.value?.sticker ?? 'none');
  const [personality, setPersonality] = useState<Personality>(block.value?.personality ?? 'calm');
  const [name, setName] = useState(block.value?.name ?? '');
  const tokens = useTokens();
  return (
    <Card>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        {block.prompt}
      </Text>
      <View style={{ alignItems: 'center', marginBottom: tokens.spacing.sm }}>
        <MegaSprite hex={hex} sticker={sticker as never} face={PERSONALITIES[personality].face} scale={3} />
      </View>
      <Text variant="caption" color="muted">
        Color
      </Text>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, marginVertical: tokens.spacing.sm }}>
        {Object.entries(COLORS).map(([key, value]) => (
          <SwatchButton key={key} hex={value} selected={value === hex} onPress={() => setHex(value)} label={key} />
        ))}
      </View>
      <Text variant="caption" color="muted">
        Sticker
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, marginVertical: tokens.spacing.sm }}>
        {STICKERS.map((s) => (
          <Chip key={s} label={s} selected={sticker === s} onPress={() => setSticker(s)} />
        ))}
      </View>
      <Text variant="caption" color="muted">
        Personality
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, marginVertical: tokens.spacing.sm }}>
        {Object.entries(PERSONALITIES).map(([key, p]) => (
          <Chip key={key} label={p.label} selected={personality === key} onPress={() => setPersonality(key as Personality)} />
        ))}
      </View>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name"
        placeholderTextColor={tokens.muted}
        style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget }}
        accessibilityLabel="MEGA name"
      />
      <Button
        label="Save"
        onPress={() => onAnswer({ fields: { hex, sticker, personality, name } })}
        style={{ marginTop: tokens.spacing.sm }}
        disabled={!HEX_RE.test(hex) || !name}
      />
    </Card>
  );
}

function SwatchButton({ hex: _hex, selected, onPress, label }: { hex: string; selected: boolean; onPress: () => void; label: string }) {
  return (
    <Chip label={selected ? `${label} ✓` : label} selected={selected} onPress={onPress} accessibilityLabel={`${label} color${selected ? ', selected' : ''}`} />
  );
}

function QuestionsBlock({ block, onAnswer }: { block: Extract<UIBlock, { kind: 'questions' }>; onAnswer: (a: BlockAnswer) => void }) {
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(block.items.map((i) => [i.id, i.on])));
  const tokens = useTokens();
  return (
    <Card>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        {block.prompt}
      </Text>
      <View style={{ gap: tokens.spacing.sm }}>
        {block.items.map((i) => (
          <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ flex: 1 }}>{i.text}</Text>
            <Switch value={on[i.id]} onValueChange={(v) => setOn((s) => ({ ...s, [i.id]: v }))} trackColor={{ true: tokens.accent }} accessibilityLabel={i.text} />
          </View>
        ))}
      </View>
      <Button
        label="Looks good"
        onPress={() => onAnswer({ fields: Object.fromEntries(Object.entries(on).filter(([, v]) => v).map(([k]) => [k, 'on'])) })}
        style={{ marginTop: tokens.spacing.sm }}
      />
    </Card>
  );
}

function InviteBlock({ block: _block }: { block: Extract<UIBlock, { kind: 'invite' }> }) {
  const tokens = useTokens();
  return (
    <Card>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        Invite sent
      </Text>
      <Text color="muted">A QR code and link are ready to share — open the member&rsquo;s row in Family to view them.</Text>
      <View style={{ height: 96, borderRadius: tokens.radii.sm, borderWidth: 1, borderColor: tokens.line, marginTop: tokens.spacing.sm, alignItems: 'center', justifyContent: 'center' }}>
        <Text color="muted">QR code</Text>
      </View>
    </Card>
  );
}

function ConfirmBlock({ block, onAnswer }: { block: Extract<UIBlock, { kind: 'confirm' }>; onAnswer: (a: BlockAnswer) => void }) {
  const tokens = useTokens();
  return (
    <Card>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        {block.prompt}
      </Text>
      <View style={{ gap: tokens.spacing.xs, marginBottom: tokens.spacing.sm }}>
        {block.summary.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text color="muted">{row.label}</Text>
            <Text>{row.value}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <Button label="Change" variant="secondary" onPress={() => onAnswer({ value: 'change' })} />
        <Button label="Confirm" onPress={() => onAnswer({ value: 'confirm' })} />
      </View>
    </Card>
  );
}
