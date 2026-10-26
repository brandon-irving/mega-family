// Shared full Lists view (PLAN §4: "full family Calendar and Lists live here; the Today sheet keeps
// just today"). add/check/remove go through lists.addItem/check/remove.
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { API } from '@shared/domain/api';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export type ListSummary = Infer<(typeof API)['lists']['all']['returns']>[number];

export type ListsContentProps = {
  lists: ListSummary[];
  onAddItem: (listId: string, text: string) => void;
  onCheckItem: (itemId: string, checked: boolean) => void;
  onRemoveItem: (itemId: string) => void;
};

export function ListsContent({ lists, onAddItem, onCheckItem, onRemoveItem }: ListsContentProps) {
  const tokens = useTokens();
  if (lists.length === 0) return <Text color="muted">No lists yet.</Text>;
  return (
    <View style={{ gap: tokens.spacing.md }}>
      {lists.map((l) => (
        <ListCard key={l.list._id} list={l} onAddItem={(text) => onAddItem(l.list._id, text)} onCheckItem={onCheckItem} onRemoveItem={onRemoveItem} />
      ))}
    </View>
  );
}

function ListCard({ list, onAddItem, onCheckItem, onRemoveItem }: { list: ListSummary; onAddItem: (text: string) => void; onCheckItem: (itemId: string, checked: boolean) => void; onRemoveItem: (itemId: string) => void }) {
  const [text, setText] = useState('');
  const tokens = useTokens();
  return (
    <Card>
      <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
        {list.list.name}
      </Text>
      <View style={{ gap: tokens.spacing.xs, marginBottom: tokens.spacing.sm }}>
        {list.items.map((item) => (
          <View key={item._id} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
            <Pressable
              onPress={() => onCheckItem(item._id, !item.checked)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.checked }}
              accessibilityLabel={item.text}
              style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: tokens.line, alignItems: 'center', justifyContent: 'center', backgroundColor: item.checked ? tokens.accent : 'transparent' }}
            >
              {item.checked && <Text style={{ color: tokens.onAccent, fontSize: 14 }}>✓</Text>}
            </Pressable>
            <Text style={{ flex: 1, textDecorationLine: item.checked ? 'line-through' : 'none' }}>{item.text}</Text>
            <Pressable onPress={() => onRemoveItem(item._id)} accessibilityRole="button" accessibilityLabel={`Remove ${item.text}`}>
              <Text color="muted">✕</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => {
          if (text.trim()) onAddItem(text.trim());
          setText('');
        }}
        placeholder="Add item"
        placeholderTextColor={tokens.muted}
        style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget }}
        accessibilityLabel={`Add item to ${list.list.name}`}
      />
    </Card>
  );
}
