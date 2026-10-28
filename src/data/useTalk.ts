// Talk mode's upload + transcribe step (CONTRACT §4 `files.uploadUrl`, `talk.transcribe`): the recorded
// clip is POSTed straight to Convex storage (no server round trip through our own backend code), then
// handed to the transcribe action by its storageId.
import { useAction, useMutation } from 'convex/react';
import type { SpokenMention } from '@shared/domain/messages';
import { api } from './api';
import { uploadToStorage } from './uploadToStorage';

export function useUploadAndTranscribe() {
  const getUploadUrl = useMutation(api.files.uploadUrl);
  const transcribe = useAction(api.talk.transcribe);

  return async (uri: string, mimeType: string): Promise<{ text: string; mentions: SpokenMention[] }> => {
    const storageId = await uploadToStorage(await getUploadUrl({}), uri, mimeType);
    return transcribe({ storageId });
  };
}
