// One guard for the adult-only routes (G5 UX review, Oct 29): a kid who lands on one — a typed URL, a stale
// deep link — is sent back to chat before the screen's own queries run, the way /homework always did. The
// server refuses the calls regardless; this keeps a kid from ever seeing the adult page. `adminOnly` narrows
// it to the admin (Activity). Wrap the screen's body so its hooks only run for the right people.
import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { useViewer } from '@/data/useViewer';
import { isAdultRole } from '@/features/shell/familyDirectory';
import { MegaLoader } from '@/features/walkers';

export function AdultOnly({ adminOnly = false, children }: { adminOnly?: boolean; children: ReactNode }) {
  const viewer = useViewer();
  if (viewer === undefined) return <MegaLoader />;
  const role = viewer?.member.role;
  const allowed = role != null && (adminOnly ? role === 'admin' : isAdultRole(role));
  if (!allowed) return <Redirect href="/chat" />;
  return <>{children}</>;
}
