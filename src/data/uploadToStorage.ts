// POSTs a local file straight to Convex storage via a `files.uploadUrl` URL (CONTRACT §4) and returns its
// storageId — the one upload path for talk-mode clips and homework photos.
import type { Id } from '@shared/domain/validators';

export async function uploadToStorage(uploadUrl: string, uri: string, mimeType: string): Promise<Id<'_storage'>> {
  // RN's fetch supports reading a local file:// URI (and a web blob: URI) into a Blob directly.
  const body = await (await fetch(uri)).blob();
  const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': mimeType }, body });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const { storageId } = (await res.json()) as { storageId: string };
  return storageId as Id<'_storage'>;
}
