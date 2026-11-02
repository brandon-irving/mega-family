/** Capability matching is provider-independent. Providers supply capabilities and a setup adapter. */
export type ConnectionCapability = 'correspondence' | 'availability';
export type ConnectionDefinition = {
  id: string; label: string; setup: string; ageGroups: readonly string[];
  capabilities: readonly ConnectionCapability[];
};
export const CONNECTION_CATALOG: readonly ConnectionDefinition[] = [{
  id: 'google', label: 'Google', setup: 'google', ageGroups: ['adult', 'teen'],
  capabilities: ['correspondence', 'availability'],
}];
export const CONNECTION_CONTEXT = [
  { capability: 'correspondence' as const, terms: ['book', 'publicity', 'promot', 'launch', 'customer', 'client', 'email', 'inbox', 'school', 'invitation', 'follow-up'], reason: 'find relevant correspondence, invitations, and follow-ups instead of asking you to repeat everything' },
  { capability: 'availability' as const, terms: ['schedule', 'calendar', 'busy', 'meeting', 'lunch', 'week', 'appointment', 'deadline', 'time', 'plan'], reason: 'understand your commitments and suggest times that fit your week' },
];
export const CONNECTION_COPY = {
  setupReady: 'You can review the connection setup in the card. You choose the permissions; I haven’t connected anything yet.',
  accept: 'Explore connection', decline: 'Not now', creatorAccept: 'Yes, ask them', creatorDecline: 'Skip that suggestion',
  optional: 'You choose what to connect and share. We can keep going without it.',
  creator: (name: string, provider: string, reason: string) => `Can I ask ${name} to connect their ${provider} account? It could help their MEGA ${reason.replaceAll('your', 'their').replaceAll('you', 'them')}. They will review and approve access themselves.`,
  own: (provider: string, reason: string) => `Would you like to connect your ${provider} account so I can ${reason}?`,
  fallbackReason: 'learn more about your day-to-day context and make my help more useful',
  approved: 'I’ll offer that connection when they review their brief. They still decide whether to connect.',
  declined: 'We’ll continue without that connection suggestion. You can still connect an account whenever you choose.',
};
export type ConnectionCandidate = { providerId: string; label: string; setup: string; capabilities: ConnectionCapability[]; reason: string; score: number };
/** Stable ranking, unavailable/ineligible providers and already connected capabilities are excluded. */
export function rankConnections(input: { context: string; ageGroup: string; connected: readonly ConnectionCapability[]; available: readonly string[]; excluded?: readonly string[]; allowBaseline?: boolean }, catalog = CONNECTION_CATALOG): ConnectionCandidate[] {
  const text = input.context.toLowerCase().slice(0, 4000);
  const words = text.split(/[^a-z0-9-]+/);
  const matches = CONNECTION_CONTEXT.filter(rule => rule.terms.some(term => words.some(word => word.startsWith(term))));
  return catalog.flatMap(provider => {
    if (!input.available.includes(provider.id) || !provider.ageGroups.includes(input.ageGroup) || input.excluded?.includes(provider.id)) return [];
    const missing = provider.capabilities.filter(c => !input.connected.includes(c));
    const useful = matches.filter(rule => missing.includes(rule.capability));
    if (!missing.length || (!useful.length && (!input.allowBaseline || input.connected.length > 0))) return [];
    return [{ providerId: provider.id, label: provider.label, setup: provider.setup, capabilities: useful.length ? useful.map(r => r.capability) : missing, reason: useful.length ? useful.map(r => r.reason).join(' and ') : CONNECTION_COPY.fallbackReason, score: useful.length * 10 + missing.length }];
  }).sort((a, b) => b.score - a.score || a.providerId.localeCompare(b.providerId));
}
