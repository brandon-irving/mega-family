// Adult memory review: paginated, virtualized results with explicit forget feedback.
import { useRef, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { memoryDoc } from '@shared/domain/api';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { errorCopyFor } from '@/data/errorCopy';
import { Button } from '@/ui/Button';

export type MemoryDoc = Infer<typeof memoryDoc>;

export type MemoriesContentProps = { memories: MemoryDoc[]; search: string; onSearch: (text: string) => void; onForget: (memoryId: string) => Promise<unknown> | void; status?: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'; onLoadMore?: () => void };

export function MemoriesContent({ memories, search, onSearch, onForget, status, onLoadMore }: MemoriesContentProps) {
  const tokens = useTokens();
  const [text, setText] = useState(search);
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const forget = async (id: string) => {
    if (running.current) return;
    running.current = true;
    setBusy(id);
    setError(null);
    try { await onForget(id); }
    catch (err) { setError(errorCopyFor(err)); }
    finally { running.current = false; setBusy(null); }
  };
  return (
    <FlatList keyboardDismissMode="on-drag" data={memories} keyExtractor={(memory) => memory._id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: tokens.spacing.lg, gap: tokens.spacing.sm }}
      ListHeaderComponent={<>
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
      {error ? <Text style={{ color: tokens.danger }} accessibilityRole="alert">{error}</Text> : null}
      </>}
      ListEmptyComponent={<Text color="muted">No memories found.</Text>}
      ListFooterComponent={status === 'CanLoadMore' || status === 'LoadingMore' ? <Button label="Load more memories" variant="secondary" loading={status === 'LoadingMore'} onPress={onLoadMore} /> : status === 'Exhausted' && memories.length > 0 ? <Text variant="caption" color="muted">All matching memories are shown.</Text> : undefined}
      renderItem={({ item: m }) => (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text>{m.text}</Text>
                <Text variant="caption" color="muted" style={{ textTransform: 'capitalize' }}>
                  {m.scope} · {m.kind}
                </Text>
              </View>
              <Pressable onPress={() => void forget(m._id)} disabled={!!busy} accessibilityState={{ disabled: !!busy }} accessibilityRole="button" accessibilityLabel={`Forget: ${m.text}`} style={{ minHeight: tokens.touchTarget, justifyContent: 'center', paddingHorizontal: tokens.spacing.sm }}>
                <Text color="muted">{busy === m._id ? 'Forgetting…' : 'Forget'}</Text>
              </Pressable>
            </Card>
      )}
    />
  );
}
