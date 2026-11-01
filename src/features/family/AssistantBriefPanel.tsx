import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { Id } from '@shared/domain/validators';
import type { BlockAnswer } from '@shared/domain/messages';
import { emptyAssistantBrief } from '@shared/domain/assistantBrief';
import { ASSISTANT_BRIEF as C, briefSummary } from '@shared/config/assistantBrief';
import { fillCopy } from '@shared/config/copy';
import { briefFieldsBlock } from '@shared/assistantBrief';
import { useAssistantBrief, useSaveAssistantBrief } from '@/data/useAssistantBrief';
import { errorCopyFor } from '@/data/errorCopy';
import { FieldsForm } from '@/ui/FieldsForm';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export function AssistantBriefPanel({ memberId, name, joined = false }: { memberId: Id<'members'>; name: string; joined?: boolean }) {
  const tokens = useTokens();
  const state = useAssistantBrief(memberId);
  const save = useSaveAssistantBrief();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  if (state.status !== 'ok') return null;
  const brief = state.data;
  if (!brief && joined) return null;
  const canEdit = brief?.canEdit ?? !joined;
  const submit = async (answer: BlockAnswer) => {
    if (saving.current) return;
    if (answer.skipped) { setEditing(false); return; }
    saving.current = true;
    setBusy(true); setError(null);
    try {
      await save({ memberId, brief: { ...emptyAssistantBrief(), ...answer.fields } });
      setEditing(false);
    } catch (e) { setError(errorCopyFor(e)); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Card style={{ gap: tokens.spacing.sm }}>
    {editing ? <FieldsForm block={briefFieldsBlock(fillCopy(C.creatorPrompt, { name }), brief?.proposed)} onAnswer={answer => void submit(answer)} busy={busy} /> : <View style={{ gap: tokens.spacing.sm }}>
      <Text variant="label">{C.title}</Text>
      <Text variant="caption" color="muted">{brief ? C.status[brief.status] : C.creatorHint}</Text>
      {brief?.helpRequested ? <Text>{fillCopy(C.helpNotice, { name })}</Text> : null}
      {brief ? <Text color="muted">{briefSummary(brief.proposed)}</Text> : null}
      {canEdit ? <Button label={brief ? C.edit : C.title} variant="secondary" onPress={() => setEditing(true)} /> : null}
    </View>}
    {error ? <Text accessibilityRole="alert" color="muted">{error}</Text> : null}
  </Card>;
}
