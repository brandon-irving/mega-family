// Lists keep drafts until a write succeeds and expose every failed action beside its list.
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { API } from '@shared/domain/api';
import { readableOn } from '@shared/config/theme';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { ModalSheet } from '@/ui/ModalSheet';
import { useTokens } from '@/ui/theme';
import { errorCopyFor } from '@/data/errorCopy';

export type ListSummary = Infer<(typeof API)['lists']['all']['returns']>[number];
type ListScope = 'personal' | 'family' | 'adults';
type Action = Promise<unknown> | void;
export type ListsContentProps = {
  lists: ListSummary[];
  onAddItem: (listId: string, text: string) => Action;
  onCheckItem: (itemId: string, checked: boolean) => Action;
  onRemoveItem: (itemId: string) => Action;
  onCreateList?: (name: string, scope: ListScope) => Action;
};

export function ListsContent({ lists, onAddItem, onCheckItem, onRemoveItem, onCreateList }: ListsContentProps) {
  const tokens = useTokens();
  const [creating, setCreating] = useState(false);
  return (
    <View style={{ gap: tokens.spacing.md }}>
      {onCreateList ? <Button label="New list" variant="secondary" onPress={() => setCreating(true)} /> : null}
      {lists.length === 0 ? <Text color="muted">Keep groceries, plans, and things to do in one place. Create a list to get started.</Text> : null}
      {lists.map((l) => <ListCard key={l.list._id} list={l} onAddItem={(text) => onAddItem(l.list._id, text)} onCheckItem={onCheckItem} onRemoveItem={onRemoveItem} />)}
      {creating && onCreateList ? <CreateListSheet onClose={() => setCreating(false)} onCreate={onCreateList} /> : null}
    </View>
  );
}

function CreateListSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, scope: ListScope) => Action }) {
  const tokens = useTokens();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ListScope>('family');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    if (!name.trim() || running.current) return;
    running.current = true; setBusy(true); setError(null);
    try { await onCreate(name.trim(), scope); if (mounted.current) onClose(); }
    catch (err) { if (mounted.current) setError(errorCopyFor(err)); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  };
  return <ModalSheet open title="New list" closeLabel="Close new list" onClose={onClose}>
    <TextInput value={name} onChangeText={setName} editable={!busy} maxLength={100} placeholder="List name" placeholderTextColor={tokens.muted} accessibilityLabel="List name" onSubmitEditing={() => void create()} style={{ color: tokens.text, borderWidth: 1, borderColor: tokens.line, borderRadius: tokens.radii.md, minHeight: tokens.touchTarget, padding: tokens.spacing.md }} />
    <Text variant="label">Who can see it?</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
      {([{ id: 'personal', label: 'Only me' }, { id: 'family', label: 'Family' }, { id: 'adults', label: 'Adults' }] as const).map((choice) => <Chip key={choice.id} label={choice.label} selected={scope === choice.id} onPress={busy ? undefined : () => setScope(choice.id)} />)}
    </View>
    {error ? <Text style={{ color: tokens.danger }} accessibilityRole="alert">{error}</Text> : null}
    <Button label="Create list" disabled={!name.trim()} loading={busy} onPress={() => void create()} />
  </ModalSheet>;
}

function ListCard({ list, onAddItem, onCheckItem, onRemoveItem }: { list: ListSummary; onAddItem: (text: string) => Action; onCheckItem: (itemId: string, checked: boolean) => Action; onRemoveItem: (itemId: string) => Action }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const tokens = useTokens();
  const run = async (key: string, action: () => Action, onSuccess?: () => void) => {
    if (running.current) return;
    running.current = true; setBusy(key); setError(null);
    try { await action(); onSuccess?.(); }
    catch (err) { setError(errorCopyFor(err)); }
    finally { running.current = false; setBusy(null); }
  };
  const add = () => { if (text.trim()) void run('add', () => onAddItem(text.trim()), () => setText('')); };
  return <Card>
    <Text variant="label">{list.list.name}</Text>
    <Text variant="caption" color="muted" style={{ marginBottom: tokens.spacing.sm }}>{list.list.scope === 'personal' ? 'Only you' : list.list.scope === 'adults' ? 'Adults' : 'Family'}</Text>
    <View style={{ gap: tokens.spacing.xs, marginBottom: tokens.spacing.sm }}>
      {list.items.map((item) => <View key={item._id} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
        <Pressable onPress={() => void run(item._id, () => onCheckItem(item._id, !item.checked))} disabled={!!busy} accessibilityRole="checkbox" accessibilityState={{ checked: item.checked, disabled: !!busy }} accessibilityLabel={item.text} style={{ flex: 1, minHeight: tokens.touchTarget, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: tokens.line, alignItems: 'center', justifyContent: 'center', backgroundColor: item.checked ? tokens.accent : 'transparent' }}>
            {item.checked ? <Text style={{ color: readableOn(tokens.accent), fontSize: 14 }}>✓</Text> : null}
          </View>
          <Text style={{ flex: 1, textDecorationLine: item.checked ? 'line-through' : 'none' }}>{item.text}</Text>
        </Pressable>
        <Pressable onPress={() => void run(item._id, () => onRemoveItem(item._id))} disabled={!!busy} accessibilityRole="button" accessibilityLabel={`Remove ${item.text}`} accessibilityState={{ disabled: !!busy }} style={{ width: tokens.touchTarget, minHeight: tokens.touchTarget, alignItems: 'center', justifyContent: 'center' }}><Text color="muted">✕</Text></Pressable>
      </View>)}
    </View>
    <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
      <TextInput value={text} onChangeText={setText} editable={!busy} onSubmitEditing={add} placeholder="Add item" placeholderTextColor={tokens.muted} style={{ flex: 1, minWidth: 0, color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.md, padding: tokens.spacing.sm, minHeight: tokens.touchTarget }} accessibilityLabel={`Add item to ${list.list.name}`} />
      <Button label="Add" accessibilityLabel={`Add to ${list.list.name}`} onPress={add} disabled={!text.trim() || (!!busy && busy !== 'add')} loading={busy === 'add'} />
    </View>
    {error ? <Text accessibilityRole="alert" style={{ color: tokens.danger, marginTop: tokens.spacing.sm }}>{error}</Text> : null}
  </Card>;
}
