// Who's who for the GD cards: member names, roles and each member's MEGA, built once from data the app
// already loads (`me.get` + `family.members`) — no extra backend call per card.
import { useMemo } from 'react';
import type { Infer } from 'convex/values';
import type { megaDoc } from '@shared/domain/api';
import type { Role } from '@shared/domain/enums';
import { useFamilyMembers } from '@/data/useFamily';
import { useViewer } from '@/data/useViewer';

export type DirectoryMember = { id: string; name: string; role: Role; mega: Infer<typeof megaDoc> | null };

export type FamilyDirectory = {
  me: { id: string; name: string; role: Role; isAdult: boolean; isAdmin: boolean; parentOf: string[] } | null;
  byId: Record<string, DirectoryMember>;
  kids: DirectoryMember[];
  nameOf: (id: string | undefined) => string;
  megaNameOf: (memberId: string | undefined) => string;
};

export function isAdultRole(role: Role): boolean {
  return role === 'admin' || role === 'adult';
}

export function useFamilyDirectory(): FamilyDirectory {
  const viewer = useViewer();
  const members = useFamilyMembers();
  return useMemo(() => {
    const byId: Record<string, DirectoryMember> = {};
    for (const m of members ?? []) byId[m.member._id] = { id: m.member._id, name: m.member.name, role: m.member.role, mega: m.mega };
    const me = viewer
      ? {
          id: viewer.member._id as string,
          name: viewer.member.name,
          role: viewer.member.role,
          isAdult: isAdultRole(viewer.member.role),
          isAdmin: viewer.member.role === 'admin',
          parentOf: viewer.isParentOf as string[],
        }
      : null;
    return {
      me,
      byId,
      kids: Object.values(byId).filter((m) => m.role === 'kid'),
      nameOf: (id) => (id && byId[id]?.name) || '',
      megaNameOf: (memberId) => (memberId && byId[memberId]?.mega?.name) || 'MEGA',
    };
  }, [viewer, members]);
}
