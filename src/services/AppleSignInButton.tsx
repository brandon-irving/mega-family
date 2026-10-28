// Sign in with Apple is iOS-only (PLAN.md → Sign-in); Android and web render nothing. The iOS button is
// AppleSignInButton.ios.tsx.
export type AppleSignInButtonProps = { onPress: () => void; height: number; disabled?: boolean };

export function AppleSignInButton(_props: AppleSignInButtonProps) {
  return null;
}
