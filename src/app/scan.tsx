// mega://scan — the invite QR scanner (G8; boards LoginScan, ScanDenied, ScanNotInvite, ScanFound), opened
// from the invite screen's "Scan QR code" card. Native only (G8 decision 6): on the web there's no scanner,
// so this sends back to the invite screen. A good scan replaces this screen with the join route
// (`/join/<token>` → preview → redeem), so Back from the invite goes to the invite screen, not the camera.
import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { router } from '@/features/shell/navigation';
import { InviteScannerBody, useInviteScan } from '@/features/signin/InviteScanner';
import { SignInFrame } from '@/features/signin/parts';
import { useDismiss } from '@/ui/dismiss';

export default function ScanRoute() {
  const close = () => (router.canGoBack() ? router.back() : router.replace('/invite' as never));
  useDismiss(close, { androidBack: false });
  const { phase, scene, onScanned } = useInviteScan((token) => router.replace(`/join/${token}` as never));
  if (Platform.OS === 'web') return <Redirect href={'/invite' as never} />;
  return (
    <SignInFrame presentation="sheet" scene={scene} testID="scan">
      <InviteScannerBody
        phase={phase}
        onScanned={onScanned}
        onPasteInstead={close}
        onClose={close}
        // "Not now" (board ScanDenied): leave the camera and the invite screen together.
        onNotNow={() => (router.canDismiss() ? router.dismissAll() : close())}
      />
    </SignInFrame>
  );
}
