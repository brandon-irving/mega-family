// A megaId -> MegaInfo map built from family.members, so chat (and the kid thread) can show any
// MEGA's badge and name beside its messages, not just the viewer's own.
import { useMemo } from 'react';
import type { Id } from '@shared/domain/validators';
import { megaInfo, type MegaInfo } from '@/features/shell/megaInfo';
import { useFamilyMembers } from './useFamily';

export function useMegaDirectory(): Record<string, MegaInfo> {
  const members = useFamilyMembers();
  return useMemo(() => {
    if (!members) return {};
    const out: Record<string, MegaInfo> = {};
    for (const m of members) if (m.mega) out[m.mega._id as Id<'megas'>] = megaInfo(m.mega);
    return out;
  }, [members]);
}
