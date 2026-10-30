import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { api } from '@/data/api';
import { uploadToStorage } from '@/data/uploadToStorage';
import { pickDocument } from '@/services/pickDocument';
import { ModalSheet } from '@/ui/ModalSheet';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';

const MAX_BYTES = 10 * 1024 * 1024;
type PickedFile = { uri: string; name: string; mimeType: string; size?: number };
function releaseFile(file: PickedFile | null) {
  if (Platform.OS === 'web' && file?.uri.startsWith('blob:')) URL.revokeObjectURL(file.uri);
}
export function useAttachments(send: (file: { storageId: Id<'_storage'>; name: string; mimeType: string }) => Promise<void>) {
  const uploadUrl = useMutation(api.files.uploadUrl);
  const [menu, setMenu] = useState(false);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picking = useRef(false);
  const sending = useRef(false);
  const uploaded = useRef<Id<'_storage'> | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => releaseFile(file), [file]);
  const select = async (source: 'camera' | 'photos' | 'files') => {
    if (picking.current) return;
    picking.current = true; setMenu(false); setError(null);
    try {
      let picked: PickedFile | undefined;
      if (source === 'files') {
        // Dynamic import lets older development builds show an actionable error instead of crashing.
        const result = await pickDocument();
        if (!result.canceled) { const asset = result.assets[0]; picked = { ...asset, mimeType: asset.mimeType ?? 'application/octet-stream' }; }
      } else {
        if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Allow camera access in Settings to take a photo.');
        const result = source === 'camera' ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
        if (!result.canceled) { const asset = result.assets[0]; picked = { uri: asset.uri, name: asset.fileName ?? 'Photo.jpg', mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize }; }
      }
      if (picked) {
        if (!mounted.current) { releaseFile(picked); return; }
        if ((picked.size ?? 0) > MAX_BYTES) { releaseFile(picked); throw new Error('Choose a file smaller than 10 MB.'); }
        uploaded.current = null; setFile(picked);
      }
    } catch (err) {
      if (!mounted.current) return;
      const message = err instanceof Error ? err.message : 'Could not open this attachment.';
      setError(message.includes('native module') || message.includes('ExpoDocumentPicker') ? 'Files needs the updated MEGA development build. Camera and Photos are available now.' : message);
    } finally { picking.current = false; }
  };
  const open = () => {
    if (picking.current || menu || file) return;
    if (Platform.OS === 'ios') {
      picking.current = true;
      ActionSheetIOS.showActionSheetWithOptions({ options: ['Cancel', 'Camera', 'Photos', 'Files'], cancelButtonIndex: 0 }, index => {
        picking.current = false;
        if (index && mounted.current) void select((['camera', 'photos', 'files'] as const)[index - 1]);
      });
    } else setMenu(true);
  };
  const sendFile = async () => {
    if (!file || sending.current) return;
    sending.current = true; setBusy(true); setError(null);
    try {
      // The picker rejects known oversized files; the uploader also checks the actual blob before POST.
      if (!uploaded.current) uploaded.current = await uploadToStorage(await uploadUrl({}), file.uri, file.mimeType, MAX_BYTES);
      if (!mounted.current) return;
      await send({ storageId: uploaded.current, name: file.name, mimeType: file.mimeType });
      if (!mounted.current) return;
      setFile(null); uploaded.current = null;
    } catch { if (mounted.current) setError('Could not send this attachment. Please try again.'); }
    finally { sending.current = false; if (mounted.current) setBusy(false); }
  };
  const sheets = <>
    <ModalSheet open={menu} title="Add attachment" closeLabel="Close attachments" onClose={() => setMenu(false)}>
      <Button label="Camera" variant="outline" onPress={() => void select('camera')} />
      <Button label="Photos" variant="outline" onPress={() => void select('photos')} />
      <Button label="Files" variant="outline" onPress={() => void select('files')} />
    </ModalSheet>
    <ModalSheet open={!!file || !!error} title={file ? 'Send attachment' : 'Attachment unavailable'} closeLabel="Close attachment preview" onClose={() => { if (!sending.current) { setFile(null); setError(null); uploaded.current = null; } }}>
      {file ? <Text>{file.name}</Text> : null}
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      {file ? <Button label="Send attachment" loading={busy} onPress={() => void sendFile()} /> : null}
    </ModalSheet>
  </>;
  return { open, sheets };
}
