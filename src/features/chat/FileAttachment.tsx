import { Image, Linking, Pressable, View } from 'react-native';
import { useState } from 'react';
import type { Id } from '@shared/domain/validators';
import { api } from '@/data/api';
import { useQuery } from '@/data/useQuery';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { Glyph } from '@/features/integrations/glyphs';

export function FileAttachment({ messageId, name, photo = false }: { messageId: Id<'messages'>; name: string; photo?: boolean }) {
  const url = useQuery(api.files.messageUrl, { messageId });
  const [error, setError] = useState(false);
  const tokens = useTokens();
  return <View style={{ gap: tokens.spacing.sm }}>
    {photo && url ? <Image source={{ uri: url }} accessibilityLabel={name} resizeMode="contain" style={{ width: 220, height: 220, borderRadius: tokens.radii.md }} /> : null}
    <Pressable disabled={!url} accessibilityRole="button" accessibilityLabel={`Open attachment: ${name}`} onPress={() => { if (url) void Linking.openURL(url).catch(() => setError(true)); }} style={{ minHeight: 44, flexDirection: 'row', gap: tokens.spacing.sm, alignItems: 'center' }}>
      <Glyph name="external" color={tokens.accent} /><Text color="accent" style={{ flexShrink: 1 }}>{name}</Text>
    </Pressable>
    {error ? <Text accessibilityRole="alert">Could not open this file. Try again.</Text> : null}
  </View>;
}
