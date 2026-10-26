// Talk mode's upload + transcribe step (CONTRACT §4 `files.uploadUrl`, `talk.transcribe`): the recorded
// clip is POSTed straight to Convex storage (no server round trip through our own backend code), then
// handed to the transcribe action by its storageId.
import { useAction, useMutation } from 'convex/react';
import type { SpokenMention } from '@shared/domain/messages';
import { api } from './api';

export function useUploadAndTranscribe() {
  const getUploadUrl = useMutation(api.files.uploadUrl);
  const transcribe = useAction(api.talk.transcribe);

  return async (uri: string, mimeType: string): Promise<{ text: string; mentions: SpokenMention[] }> => {
    const uploadUrl = await getUploadUrl({});
    // RN's fetch supports reading a local file:// URI (and a web blob: URI) into a Blob directly.
    const clip = await (await fetch(uri)).blob();
    const uploadResult = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': mimeType }, body: clip });
    if (!uploadResult.ok) throw new Error(`Upload failed (${uploadResult.status})`);
    const { storageId } = (await uploadResult.json()) as { storageId: string };
    return transcribe({ storageId: storageId as never });
  };
}
