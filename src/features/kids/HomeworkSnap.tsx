// Board KidsSnap (G8: SnapStarting, SnapDenied, SnapFailed, canvas v41): the parent's "Homework photo" sheet
// over their chat — the frame, the tip, a big shutter, "Choose a photo instead" and the privacy line.
//
// On the phone the frame holds a live expo-camera `CameraView` (back camera; SDK 58 `useCameraPermissions`,
// `onCameraReady`, `onMountError`, `takePictureAsync`). The shutter waits for `onCameraReady` (dimmed corners,
// "Starting the camera…", shutter at 35%), then takes the photo with `HOMEWORK.capture` (`exif: false`: no
// GPS or device data leaves the phone). Permission denied or a camera that won't start shows an honest card in
// the frame with "Choose a photo instead" first, then Open Settings (denied) or "Try the camera again"
// (failed, which remounts the camera). On the web there's no live camera (G8 decision 6): the frame is the
// board's still worksheet and the shutter goes through expo-image-picker, as before.
//
// Flow: photo → `files.uploadUrl` → POST to storage → `homework.submit({ storageId })`; MEGA reads it in
// the background and the homework card appears in the parent's thread. The photo goes only to the upload:
// nothing is saved to the camera roll (invariant 7); the capture's temp file stays in the app's cache, which
// the OS manages. Adults only (the chat only shows the camera button to adults; the server re-checks).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { fillCopy, G8_COPY, G8_UI_COPY, KIDS_COPY } from '@shared/config/copy';
import { HOMEWORK } from '@shared/config/kids';
import { errorCopyFor } from '@/data/errorCopy';
import { useHomeworkActions } from '@/data/useKids';
import { uploadToStorage } from '@/data/uploadToStorage';
import { Glyph } from '@/features/integrations/glyphs';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { LockGlyph } from '@/ui/ThreadCard';
import { hiddenFromA11y } from '@/ui/a11y';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: false };
/** The board's dimmed shutter while the camera starts. */
const STARTING_OPACITY = 0.35;

export type SnapPhase = 'idle' | 'uploading' | 'denied' | { error: string };
/** The live camera's state (`none`: no live camera here — the web keeps the still worksheet). */
export type CameraState = 'none' | 'starting' | 'live' | 'denied' | 'failed';

type ViewProps = {
  megaName: string;
  phase: SnapPhase;
  camera: CameraState;
  /** The live CameraView, drawn inside the frame under the corner marks. */
  cameraSlot?: ReactNode;
  onShoot: () => void;
  onChoose: () => void;
  onClose: () => void;
  onOpenSettings?: () => void;
  onRetry?: () => void;
};

/** Presentational: the frame, tip, shutter and privacy line. */
export function HomeworkSnapView({ megaName, phase, camera, cameraSlot, onShoot, onChoose, onClose, onOpenSettings, onRetry }: ViewProps) {
  const tokens = useTokens();
  const busy = phase === 'uploading';
  const starting = camera === 'starting';
  const blocked = camera === 'denied' || camera === 'failed';
  const cornerColor = starting ? tokens.muted : tokens.text;
  const corner = (pos: object) => ({ position: 'absolute' as const, width: 36, height: 36, borderColor: cornerColor, ...pos });
  const tip = phase === 'denied' ? KIDS_COPY.cameraDenied : typeof phase === 'object' ? phase.error : busy ? KIDS_COPY.uploading : fillCopy(KIDS_COPY.cameraTip, { mega: megaName });
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: tokens.spacing.sm, paddingTop: tokens.spacing.sm }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={G8_UI_COPY.scanClose} style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name="close" color={tokens.text} size={22} stroke={2.2} />
        </Pressable>
        <Text variant="title" style={{ flex: 1, textAlign: 'center', marginRight: tokens.touchTarget }} accessibilityRole="header">
          {KIDS_COPY.cameraTitle}
        </Text>
      </View>
      <View style={{ marginTop: tokens.spacing.xl, marginHorizontal: tokens.spacing.xl, aspectRatio: 0.72, maxHeight: 470, alignSelf: 'stretch', borderRadius: tokens.radii.xl, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {camera === 'none' ? <WorksheetIllustration /> : null}
        {camera === 'starting' || camera === 'live' ? cameraSlot : null}
        {starting ? (
          <View style={[StyleSheet.absoluteFill, styles.centerFill, { gap: tokens.spacing.sm }]} accessibilityLiveRegion="polite">
            <ActivityIndicator color={tokens.text} />
            <Text color="muted">{G8_COPY.viewfinderStarting}</Text>
          </View>
        ) : null}
        {blocked ? (
          <View accessibilityRole="alert" style={[styles.centerFill, { padding: tokens.spacing.xl, gap: tokens.spacing.md }]}>
            <Glyph name="cameraOff" color={tokens.muted} size={44} stroke={1.8} />
            <Text style={{ textAlign: 'center' }}>{camera === 'denied' ? KIDS_COPY.cameraDenied : G8_COPY.viewfinderFailed}</Text>
          </View>
        ) : (
          <>
            <View style={corner({ left: 18, top: 18, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 })} />
            <View style={corner({ right: 18, top: 18, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 })} />
            <View style={corner({ left: 18, bottom: 18, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 })} />
            <View style={corner({ right: 18, bottom: 18, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 })} />
          </>
        )}
      </View>
      {blocked ? (
        <View style={{ flex: 1, justifyContent: 'center', marginHorizontal: tokens.spacing.xl, gap: tokens.spacing.sm }}>
          {typeof phase === 'object' || busy ? (
            <Text color="muted" style={{ textAlign: 'center' }}>
              {tip}
            </Text>
          ) : null}
          <Button label={KIDS_COPY.choosePhoto} onPress={onChoose} disabled={busy} loading={busy} />
          {camera === 'denied' ? (
            <Button label={G8_UI_COPY.snapOpenSettings} variant="outline" onPress={onOpenSettings} disabled={busy} />
          ) : (
            <Button label={G8_UI_COPY.snapTryAgain} variant="outline" onPress={onRetry} disabled={busy} />
          )}
        </View>
      ) : (
        <>
          <Text color="muted" style={{ marginTop: tokens.spacing.lg, marginHorizontal: tokens.spacing.xxl, textAlign: 'center' }}>
            {tip}
          </Text>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.md }}>
            <Pressable
              onPress={onShoot}
              disabled={busy || starting}
              accessibilityRole="button"
              accessibilityLabel={KIDS_COPY.takePhoto}
              accessibilityState={{ disabled: busy || starting, busy }}
              style={({ pressed }) => ({ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: tokens.text, padding: 4, opacity: starting ? STARTING_OPACITY : busy ? 0.5 : pressed ? 0.8 : 1 })}
            >
              <View style={{ flex: 1, borderRadius: 30, backgroundColor: tokens.text }} />
            </Pressable>
            <Button label={KIDS_COPY.choosePhoto} variant="ghost" onPress={onChoose} disabled={busy} />
          </View>
        </>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: tokens.spacing.xl }}>
        <LockGlyph color={tokens.muted} />
        <Text variant="caption" color="muted">
          {KIDS_COPY.cameraPrivacy}
        </Text>
      </View>
    </View>
  );
}

/** The board's tilted worksheet, drawn with Views in theme colors (decorative; the web's still frame). */
function WorksheetIllustration() {
  const tokens = useTokens();
  return (
    <View {...hiddenFromA11y()} style={{ width: '62%', aspectRatio: 0.76, transform: [{ rotate: '-4deg' }], backgroundColor: tokens.text, borderRadius: 4, padding: tokens.spacing.lg, gap: 14 }}>
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

/** Upload a photo (its local uri) and submit it; the phase follows along. */
function useSubmitPhoto(onDone: () => void) {
  const { uploadUrl, submit } = useHomeworkActions();
  const [phase, setPhase] = useState<SnapPhase>('idle');
  const send = async (uri: string, mimeType: string) => {
    setPhase('uploading');
    try {
      const storageId = await uploadToStorage(await uploadUrl({}), uri, mimeType);
      await submit({ storageId });
      onDone();
    } catch (err) {
      setPhase({ error: errorCopyFor(err) });
    }
  };
  const fromPicker = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.length) return setPhase('idle');
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > HOMEWORK.maxPhotoBytes) return setPhase({ error: KIDS_COPY.sheetFailed });
    await send(asset.uri, asset.mimeType ?? 'image/jpeg');
  };
  return { phase, setPhase, send, fromPicker };
}

/** Connected: the live viewfinder on the phone, the picker on the web; uploads, submits, closes to the chat. */
export function HomeworkSnap({ megaName, onDone }: { megaName: string; onDone: () => void }) {
  return Platform.OS === 'web' ? <HomeworkSnapPicker megaName={megaName} onDone={onDone} /> : <HomeworkSnapLive megaName={megaName} onDone={onDone} />;
}

function HomeworkSnapLive({ megaName, onDone }: { megaName: string; onDone: () => void }) {
  const { phase, send, fromPicker } = useSubmitPhoto(onDone);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const asked = useRef(false);

  // Opening the sheet is the parent asking for the camera, so ask once right away.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain && !asked.current) {
      asked.current = true;
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const state: CameraState = permission && !permission.granted && !permission.canAskAgain ? 'denied' : failed ? 'failed' : ready ? 'live' : 'starting';
  const showCamera = Boolean(permission?.granted) && !failed;

  return (
    <HomeworkSnapView
      megaName={megaName}
      phase={phase}
      camera={state}
      cameraSlot={
        showCamera ? (
          <CameraView
            key={mountKey}
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="back"
            accessibilityLabel={G8_COPY.viewfinderLabel}
            onCameraReady={() => setReady(true)}
            onMountError={() => setFailed(true)}
          />
        ) : null
      }
      onClose={onDone}
      onChoose={async () => fromPicker(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS))}
      onOpenSettings={() => void Linking.openSettings()}
      onRetry={() => {
        setFailed(false);
        setReady(false);
        setMountKey((k) => k + 1);
      }}
      onShoot={async () => {
        if (!ready || !camera.current) return;
        try {
          const photo = await camera.current.takePictureAsync(HOMEWORK.capture);
          await send(photo.uri, 'image/jpeg');
        } catch {
          setFailed(true);
        }
      }}
    />
  );
}

/** The web (and anywhere without a live camera): the system camera or library through expo-image-picker. */
function HomeworkSnapPicker({ megaName, onDone }: { megaName: string; onDone: () => void }) {
  const { phase, setPhase, fromPicker } = useSubmitPhoto(onDone);
  return (
    <HomeworkSnapView
      megaName={megaName}
      phase={phase}
      camera="none"
      onClose={onDone}
      onChoose={async () => fromPicker(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS))}
      onShoot={async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return setPhase('denied');
        try {
          await fromPicker(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
        } catch {
          // No camera here (web without one): fall back to choosing a photo.
          await fromPicker(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  centerFill: { alignItems: 'center', justifyContent: 'center' },
});
