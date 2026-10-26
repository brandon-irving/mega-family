// What it remembers (admin only, PLAN §3): search and delete. memories.list/forget/changeScope.
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { memoryDoc } from '@shared/domain/api';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export type MemoryDoc = Infer<typeof memoryDoc>;

export type MemoriesContentProps = { memories: MemoryDoc[]; search: string; onSearch: (text: string) => void; onForget: (memoryId: string) => void };

export function MemoriesContent({ memories, search, onSearch, onForget }: MemoriesContentProps) {
  const tokens = useTokens();
  const [text, setText] = useState(search);
  return (
    <>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          onSearch(t);
        }}
        placeholder="Search memories"
        placeholderTextColor={tokens.muted}
        style={{ color: tokens.text, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.sm, padding: tokens.spacing.sm, minHeight: tokens.touchTarget, marginBottom: tokens.spacing.md }}
        accessibilityLabel="Search memories"
      />
      {memories.length === 0 ? (
        <Text color="muted">No memories found.</Text>
      ) : (
        <View style={{ gap: tokens.spacing.sm }}>
          {memories.map((m) => (
            <Card key={m._id} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text>{m.text}</Text>
                <Text variant="caption" color="muted" style={{ textTransform: 'capitalize' }}>
                  {m.scope} · {m.kind}
                </Text>
              </View>
              <Pressable onPress={() => onForget(m._id)} accessibilityRole="button" accessibilityLabel={`Forget: ${m.text}`}>
                <Text color="muted">Forget</Text>
              </Pressable>
            </Card>
          ))}
        </View>
      )}
    </>
  );
}
