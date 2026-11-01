import type { Role } from './domain/enums';
export const AGE_GROUPS = ['child', 'teen', 'adult'] as const;
export type AgeGroup = typeof AGE_GROUPS[number];
export const AGE_GROUP_LABELS: Record<AgeGroup, string> = { child: 'Child · 0–12', teen: 'Teen · 13–17', adult: 'Adult · 18+' };
type Person = { role: Role; birthday?: string; ageGroup?: AgeGroup; connectionsApprovedBy?: string };
/** Age and family authority are independent. Unknown legacy minors remain children. */
export function ageGroupOf(person: Person, today: string): AgeGroup {
  if (person.birthday && /^\d{4}-\d{2}-\d{2}$/.test(person.birthday)) {
    const age = Number(today.slice(0,4)) - Number(person.birthday.slice(0,4)) - (today.slice(5) < person.birthday.slice(5) ? 1 : 0);
    return age < 13 ? 'child' : age < 18 ? 'teen' : 'adult';
  }
  return person.ageGroup ?? (person.role === 'kid' ? 'child' : 'adult');
}
export function canConnectAccounts(person: Person, today: string): boolean {
  const group = ageGroupOf(person, today);
  return group === 'adult' || (group === 'teen' && !!person.connectionsApprovedBy);
}

/** Only an explicit age at the start of the person's own brief, never a relative's age. */
export function ageGroupFromBrief(context: string): AgeGroup | undefined {
  const match = context.match(/^\s*(\d{1,3})[\s-]*(?:years?|yrs?)[\s-]*old\b/i);
  if (!match) return undefined;
  const age = Number(match[1]);
  if (age > 120) return undefined;
  return age < 13 ? 'child' : age < 18 ? 'teen' : 'adult';
}
export class AccountConnectionPermissionError extends Error {
  constructor(group: AgeGroup | 'unknown') {
    super(group === 'teen' ? 'A parent needs to approve account connections first. Go back to the parent profile, open Family → your profile, and choose Approve teen account connections.' : 'A parent needs to confirm your age group in Family → your profile. Children under 13 cannot connect accounts; teens need parent approval.');
    this.name = 'AccountConnectionPermissionError';
  }
}
