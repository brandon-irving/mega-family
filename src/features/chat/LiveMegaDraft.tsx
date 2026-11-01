import { Button } from '@/ui/Button';
import { errorCopyFor } from '@/data/errorCopy';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMegaDraft, useUpdateDraftAppearance, useReviewMegaDraft } from '@/data/useMegaDraft';
import { MegaSprite } from '@/ui/MegaSprite';
import { PERSONALITIES } from '@shared/config/looks';
import { CHARACTER_EDITOR } from '@shared/config/characterEditor';
import { LookPersonalityContent } from '@/features/profile/LookPersonalityContent';
import { Text } from '@/ui/Text';
import { ModalSheet } from '@/ui/ModalSheet';
import { useTokens } from '@/ui/theme';
import { MegaDraftPreview } from './MegaDraftPreview';

export function LiveMegaDraft() {
  const draft = useMegaDraft();
  const update = useUpdateDraftAppearance();
  const review = useReviewMegaDraft();
  const reviewing = useRef(false);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<NonNullable<ReturnType<typeof useMegaDraft>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokens = useTokens();
  const [open, setOpen] = useState(false);
  if (!draft) return null;
  const data = draft.data;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="View MEGA draft" onPress={() => { setSnapshot(draft); setEditing(false); setError(null); setOpen(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg, backgroundColor: tokens.surface }}>
      <MegaSprite hex={data.hex} sticker={data.sticker} face={PERSONALITIES[data.personality].face} scale={1} />
      <View style={{ flex: 1 }}><Text variant="label" numberOfLines={1}>{data.megaName} · Draft</Text><Text variant="caption" color="muted" numberOfLines={1}>{data.target === 'self' ? 'Your personal MEGA' : `For ${data.name ?? 'your family member'}`}</Text></View>
      <Text variant="caption" color="accent">View draft</Text>
    </Pressable>
    {open && snapshot && snapshot.draftId === draft.draftId && <ModalSheet open closeLabel="Close" title={editing ? CHARACTER_EDITOR.title : "MEGA draft"} onClose={() => setOpen(false)}>
      {editing ? <LookPersonalityContent characterMode name={snapshot.data.megaName} value={snapshot.data} saveLabel={CHARACTER_EDITOR.saveDraft} onSave={async value => {
        await update({ draftId: snapshot.draftId, revision: snapshot.revision, megaName: value.name ?? snapshot.data.megaName, hex: value.hex, sticker: value.sticker, personality: value.personality });
        setOpen(false);
      }} /> : <>
        <MegaDraftPreview data={draft.data} />
        <Text color="muted">{CHARACTER_EDITOR.draftHint}</Text>
        <Button label="Open MEGA workshop" variant="secondary" onPress={() => { setSnapshot(draft); setEditing(true); }} />
        <Button label="Review to finalize" loading={busy} onPress={async () => {
          if (reviewing.current) return;
          reviewing.current = true; setBusy(true); setError(null);
          try { await review({ draftId: draft.draftId, revision: draft.revision }); setOpen(false); }
          catch (err) { setError(errorCopyFor(err)); }
          finally { reviewing.current = false; setBusy(false); }
        }} />
        {error && <Text accessibilityRole="alert">{error}</Text>}
      </>}
    </ModalSheet>}
  </>;
}
