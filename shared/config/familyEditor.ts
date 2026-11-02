import { RELATIONSHIPS } from '../domain/enums';
export const FAMILY_EDITOR = {
  title: 'Add a family member',
  contextOnly: 'Add without a MEGA',
  createMega: 'Create their MEGA in chat',
  description: 'Help MEGA understand your family. Adding a person here does not create an assistant, send an invitation, or connect an account.',
  name: 'Name',
  age: 'Age group',
  relationship: 'Relationship to you',
  save: 'Add family member',
  relationships: RELATIONSHIPS.map(id => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) })),
} as const;
