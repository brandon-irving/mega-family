import { ASSISTANT_BRIEF as C } from './config/assistantBrief';
import { emptyAssistantBrief, type AssistantBriefContent } from './domain/assistantBrief';
import type { UIBlock } from './domain/messages';

export function briefFieldsBlock(prompt: string, value: AssistantBriefContent = emptyAssistantBrief(), recipient = false): Extract<UIBlock, { kind: 'fields' }> {
  return {
    kind: 'fields', prompt, skippable: true,
    description: recipient ? C.editHint : C.creatorHint,
    saveLabel: C.save, skipLabel: recipient ? 'Start fresh' : C.skip,
    fields: C.fields.map(f => ({ id: f.id, label: f.label, placeholder: f.placeholder, type: 'text', value: value[f.id], multiline: true, maxLength: C.maxFieldLength })),
  };
}
