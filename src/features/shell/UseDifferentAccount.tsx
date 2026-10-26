// "Use a different account": signed in but not (yet) in a family, the welcome flow must never be a dead end
// (found Oct 26 when a real Google sign-in landed on "Join or start a family" with no way back).
import { useState } from 'react';
import { signOut } from '@/services/auth';
import { Button } from '@/ui/Button';

export function UseDifferentAccount() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label="Use a different account"
      variant="secondary"
      disabled={busy}
      onPress={async () => {
        setBusy(true);
        try {
          await signOut();
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
