// Board KidsSnap: the parent's "Homework photo" sheet over their chat — a framed worksheet, the tip, a big
// shutter, and the privacy line. The shutter opens the system camera through expo-image-picker (already in
// the dev build; SDK 58 docs: `launchCameraAsync` / `launchImageLibraryAsync`, result `{ canceled, assets }`),
// so no new native module is needed. The board's live viewfinder would need expo-camera (a new native
// build) — the frame here is the board's still worksheet illustration instead.
//
// Flow: photo → `files.uploadUrl` → POST to storage → `homework.submit({ storageId })`; MEGA reads it in
// the background and the homework card appears in the parent's thread. Adults only (the chat only shows the
// camera button to adults; the server re-checks).
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { fillCopy, KIDS_COPY } from '@shared/config/copy';
import { HOMEWORK } from '@shared/config/kids';
import { errorCopyFor } from '@/data/errorCopy';
import { useHomeworkActions } from '@/data/useKids';
import { uploadToStorage } from '@/data/uploadToStorage';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { LockGlyph } from '@/ui/ThreadCard';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: false };

export type SnapPhase = 'idle' | 'uploading' | 'denied' | { error: string };

/** Presentational: the frame, tip, shutter and privacy line. */
export function HomeworkSnapView({ megaName, phase, onShoot, onChoose, onClose }: { megaName: string; phase: SnapPhase; onShoot: () => void; onChoose: () => void; onClose: () => void }) {
  const tokens = useTokens();
  const busy = phase === 'uploading';
  const corner = (pos: object) => ({ position: 'absolute' as const, width: 36, height: 36, borderColor: tokens.text, ...pos });
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: tokens.spacing.sm, paddingTop: tokens.spacing.sm }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the camera" style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="title">✕</Text>
        </Pressable>
        <Text variant="title" style={{ flex: 1, textAlign: 'center', marginRight: tokens.touchTarget }} accessibilityRole="header">
          {KIDS_COPY.cameraTitle}
        </Text>
      </View>
      <View style={{ marginTop: tokens.spacing.xl, marginHorizontal: tokens.spacing.xl, aspectRatio: 0.72, maxHeight: 470, alignSelf: 'stretch', borderRadius: tokens.radii.xl, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <WorksheetIllustration />
        <View style={corner({ left: 18, top: 18, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 })} />
        <View style={corner({ right: 18, top: 18, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 })} />
        <View style={corner({ left: 18, bottom: 18, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 })} />
        <View style={corner({ right: 18, bottom: 18, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 })} />
      </View>
      <Text color="muted" style={{ marginTop: tokens.spacing.lg, marginHorizontal: tokens.spacing.xxl, textAlign: 'center' }}>
        {phase === 'denied' ? KIDS_COPY.cameraDenied : typeof phase === 'object' ? phase.error : busy ? KIDS_COPY.uploading : fillCopy(KIDS_COPY.cameraTip, { mega: megaName })}
      </Text>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.md }}>
        <Pressable
          onPress={onShoot}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={KIDS_COPY.takePhoto}
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => ({ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: tokens.text, padding: 4, opacity: busy ? 0.5 : pressed ? 0.8 : 1 })}
        >
          <View style={{ flex: 1, borderRadius: 30, backgroundColor: tokens.text }} />
        </Pressable>
        <Button label={KIDS_COPY.choosePhoto} variant="ghost" onPress={onChoose} disabled={busy} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: tokens.spacing.xl }}>
        <LockGlyph color={tokens.muted} />
        <Text variant="caption" color="muted">
          {KIDS_COPY.cameraPrivacy}
        </Text>
      </View>
    </View>
  );
}

/** The board's tilted worksheet, drawn with Views in theme colors (decorative). */
function WorksheetIllustration() {
  const tokens = useTokens();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: '62%', aspectRatio: 0.76, transform: [{ rotate: '-4deg' }], backgroundColor: tokens.text, borderRadius: 4, padding: tokens.spacing.lg, gap: 14 }}>
      <View style={{ height: 10, width: '55%', borderRadius: 2, backgroundColor: tokens.muted }} />
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ height: 6, flex: 1, borderRadius: 2, backgroundColor: tokens.line }} />
          <View style={{ height: 2, width: 36, backgroundColor: tokens.muted }} />
        </View>
      ))}
    </View>
  );
}

/** Connected: picks or shoots a photo, uploads it, submits it, then closes back to the chat. */
export function HomeworkSnap({ megaName, onDone }: { megaName: string; onDone: () => void }) {
  const { uploadUrl, submit } = useHomeworkActions();
  const [phase, setPhase] = useState<SnapPhase>('idle');

  const handle = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.length) return setPhase('idle');
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > HOMEWORK.maxPhotoBytes) return setPhase({ error: KIDS_COPY.sheetFailed });
    setPhase('uploading');
    try {
      const storageId = await uploadToStorage(await uploadUrl({}), asset.uri, asset.mimeType ?? 'image/jpeg');
      await submit({ storageId });
      onDone();
    } catch (err) {
      setPhase({ error: errorCopyFor(err) });
    }
  };

  return (
    <HomeworkSnapView
      megaName={megaName}
      phase={phase}
      onClose={onDone}
      onChoose={async () => handle(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS))}
      onShoot={async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return setPhase('denied');
        try {
          await handle(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
        } catch {
          // No camera here (web without one, a simulator): fall back to choosing a photo.
          await handle(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
        }
      }}
    />
  );
}
