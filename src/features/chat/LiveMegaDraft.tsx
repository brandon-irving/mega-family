import { Button } from '@/ui/Button';
import { errorCopyFor } from '@/data/errorCopy';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMegaDraft, usePersonalizeMega } from '@/data/useMegaDraft';
import { MegaSprite } from '@/ui/MegaSprite';
import { PERSONALITIES } from '@shared/config/looks';
import { MEGA_CREATION } from '@shared/config/megaCreation';
import { Text } from '@/ui/Text';
import { ModalSheet } from '@/ui/ModalSheet';
import { useTokens } from '@/ui/theme';
import { MegaDraftPreview } from './MegaDraftPreview';

export function LiveMegaDraft({ offerPersonalize = false }: { offerPersonalize?: boolean }) {
  const draft = useMegaDraft();
  const personalize = usePersonalizeMega();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokens = useTokens();
  const [open, setOpen] = useState(false);
  if (!draft) return offerPersonalize ? <View style={{ paddingHorizontal: tokens.spacing.lg }}><Button label="Personalize my MEGA" variant="ghost" loading={busy} onPress={async () => { if (busy) return; setBusy(true); setError(null); try { await personalize({}); } catch (err) { setError(errorCopyFor(err)); } finally { setBusy(false); } }} />{error && <Text accessibilityRole="alert">{error}</Text>}</View> : null;
  const data = draft.data;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="View MEGA draft" onPress={() => setOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg, backgroundColor: tokens.surface }}>
      <MegaSprite hex={data.hex} sticker={data.sticker} face={PERSONALITIES[data.personality].face} scale={1} />
      <View style={{ flex: 1 }}><Text variant="label" numberOfLines={1}>{data.megaName} · Draft</Text><Text variant="caption" color="muted" numberOfLines={1}>{data.target === 'self' ? 'Your personal MEGA' : `For ${data.name ?? 'your family member'}`}</Text></View>
      <Text variant="caption" color="accent">View draft</Text>
    </Pressable>
    {open && <ModalSheet open closeLabel="Close" title="MEGA draft" onClose={() => setOpen(false)}><MegaDraftPreview data={data} /><Text color="muted">{MEGA_CREATION.appearance}</Text></ModalSheet>}
  </>;
}
