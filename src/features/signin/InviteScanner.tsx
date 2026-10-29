// G8 (CONTRACT v0.18; boards LoginScan, ScanDenied, ScanNotInvite, ScanFound, canvas v41): scan the invite
// QR on the family admin's phone. An in-app expo-camera `CameraView` (SDK 58: `barcodeScannerSettings`,
// `onBarcodeScanned`, `useCameraPermissions`) inside a framed viewfinder, the hint as a status line, and
// "Paste a link instead". Native only (decision 6): the web keeps the invite screen's help card. The route
// (src/app/scan.tsx) puts this body in the sign-in frame with the walkers' scene for the current phase.
//
// The scanner is strict (decision 5, `inviteTokenFromScan`): only `mega://join/<token>` or a bare token opens
// anything. Any other code turns the corners and the hint warn-gold with `scanNotInvite` and keeps scanning;
// it's never opened, followed or sent anywhere. A good read turns the corners accent-teal, says "Found it!",
// and hands the token on once: further reads inside `INVITE_SCAN.cooldownMs` are ignored.
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { G8_COPY, G8_UI_COPY } from '@shared/config/copy';
import { INVITE_SCAN } from '@shared/config/auth';
import { inviteTokenFromScan } from '@shared/inviteToken';
import { Glyph } from '@/features/integrations/glyphs';
import { Pill } from '@/features/signin/parts';
import { SIGNIN_SCENES } from '@/features/signin/scenes';
import type { Scene } from '@/features/walkers';
import { Ledge } from '@/features/walkers';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export type ScanPhase = 'asking' | 'denied' | 'live' | 'notInvite' | 'found';

export type ScanHandlers = { onToken: (token: string) => void; onPasteInstead: () => void; onClose: () => void; onNotNow: () => void };

/** The board's viewfinder: 240pt, rounded, four corner marks colored by the scan's state. */
const VIEWFINDER = { size: 240, corner: 40, stroke: 4, radius: 18 } as const;

/** The scanner's state: camera permission (asked once on open: opening the scanner is the ask), what the
 * last read was, and the walkers' scene for it. */
export function useInviteScan(onToken: (token: string) => void) {
  const [permission, requestPermission] = useCameraPermissions();
  const [read, setRead] = useState<'none' | 'notInvite' | 'found'>('none');
  const openedAt = useRef<number | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain && !asked.current) {
      asked.current = true;
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const phase: ScanPhase = !permission ? 'asking' : !permission.granted ? (permission.canAskAgain ? 'asking' : 'denied') : read === 'none' ? 'live' : read;

  const onScanned = ({ data }: BarcodeScanningResult) => {
    const now = Date.now();
    if (openedAt.current !== null && now - openedAt.current < INVITE_SCAN.cooldownMs) return;
    const token = inviteTokenFromScan(data);
    if (!token) {
      setRead('notInvite');
      return;
    }
    openedAt.current = now;
    setRead('found');
    onToken(token);
  };

  const scene: Scene = phase === 'denied' ? SIGNIN_SCENES.scanDenied : phase === 'found' ? SIGNIN_SCENES.scanFound : SIGNIN_SCENES.scan;
  return { phase, scene, onScanned };
}

/** The scanner's content inside the sign-in frame: close, title, then the viewfinder or the denied card. */
export function InviteScannerBody({ phase, onScanned, onPasteInstead, onClose, onNotNow }: Omit<ScanHandlers, 'onToken'> & { phase: ScanPhase; onScanned: (r: BarcodeScanningResult) => void }) {
  const tokens = useTokens();
  const cornerColor = phase === 'found' ? tokens.accent : phase === 'notInvite' ? tokens.warn : tokens.text;
  const hint = phase === 'found' ? G8_COPY.scanFound : phase === 'notInvite' ? G8_COPY.scanNotInvite : G8_COPY.scanHint;

  return (
    <>
      <View style={styles.topRow}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={G8_UI_COPY.scanClose}
          hitSlop={tokens.hitSlop}
          style={{ width: tokens.touchTarget, height: tokens.touchTarget, marginLeft: -tokens.spacing.md, alignItems: 'center', justifyContent: 'center' }}
        >
          <Glyph name="close" color={tokens.text} size={22} stroke={2.2} />
        </Pressable>
      </View>
      <Text variant="title" weight="700" accessibilityRole="header" style={[styles.center, { marginTop: tokens.spacing.sm }]}>
        {G8_COPY.scanTitle}
      </Text>

      {phase === 'denied' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', gap: tokens.spacing.md, marginBottom: tokens.spacing.xxl }}>
            <Glyph name="cameraOff" color={tokens.muted} size={44} stroke={1.8} />
            <Text style={styles.center}>{G8_COPY.scanDenied}</Text>
          </View>
          <View style={{ gap: tokens.spacing.sm }}>
            <Ledge id="settings">
              <Pill label={G8_COPY.scanOpenSettings} onPress={() => void Linking.openSettings()} />
            </Ledge>
            <Pill variant="outline" label={G8_COPY.scanPasteInstead} onPress={onPasteInstead} />
            <Pill variant="ghost" label={G8_UI_COPY.scanNotNow} onPress={onNotNow} />
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: VIEWFINDER.size, height: VIEWFINDER.size, borderRadius: VIEWFINDER.radius, overflow: 'hidden', backgroundColor: tokens.surface }}>
            {phase === 'asking' ? null : (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: [...INVITE_SCAN.barcodeTypes] }}
                onBarcodeScanned={phase === 'found' ? undefined : onScanned}
                accessibilityLabel={G8_COPY.scanHint}
              />
            )}
            <Corners color={cornerColor} />
          </View>
          {/* Teal paces the viewfinder's bottom edge (board LoginScan). */}
          <Ledge id="reticle" style={{ alignSelf: 'stretch', height: 1 }}>
            <View />
          </Ledge>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.center, { marginTop: tokens.spacing.xl, marginHorizontal: tokens.spacing.lg, color: phase === 'notInvite' ? tokens.warn : tokens.muted }]}
          >
            {hint}
          </Text>
          <View style={{ alignSelf: 'stretch', marginTop: tokens.spacing.xl }}>
            <Pill variant="outline" label={G8_COPY.scanPasteInstead} onPress={onPasteInstead} />
          </View>
        </View>
      )}
    </>
  );
}

/** The four corner marks over the camera (decorative). */
function Corners({ color }: { color: string }) {
  const { corner, stroke, radius } = VIEWFINDER;
  const base = { position: 'absolute' as const, width: corner, height: corner, borderColor: color };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[base, { left: 0, top: 0, borderTopWidth: stroke, borderLeftWidth: stroke, borderTopLeftRadius: radius }]} />
      <View style={[base, { right: 0, top: 0, borderTopWidth: stroke, borderRightWidth: stroke, borderTopRightRadius: radius }]} />
      <View style={[base, { left: 0, bottom: 0, borderBottomWidth: stroke, borderLeftWidth: stroke, borderBottomLeftRadius: radius }]} />
      <View style={[base, { right: 0, bottom: 0, borderBottomWidth: stroke, borderRightWidth: stroke, borderBottomRightRadius: radius }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row' },
  center: { textAlign: 'center' },
});
