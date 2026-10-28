// Apple's own "Continue with Apple" button (owner, Oct 26: Apple and Google use their official buttons in
// code). Part of the auth adapter (./auth.ts): the only place outside it that touches Apple's SDK. Apple's
// guidelines forbid restyling it, so only its height and corner radius are ours (expo SDK 58 docs:
// `buttonStyle` + `cornerRadius`, never `backgroundColor`/`borderRadius` in `style`).
import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';

export type AppleSignInButtonProps = { onPress: () => void; height: number; disabled?: boolean };

export function AppleSignInButton({ onPress, height, disabled }: AppleSignInButtonProps) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    AppleAuthentication.isAvailableAsync().then((ok) => live && setAvailable(ok));
    return () => {
      live = false;
    };
  }, []);
  if (!available) return null;
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={height / 2}
      style={{ height, opacity: disabled ? 0.5 : 1 }}
      onPress={disabled ? () => {} : onPress}
    />
  );
}
