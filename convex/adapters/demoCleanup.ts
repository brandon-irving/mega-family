import { GMAIL, GOOGLE_CALENDAR } from '../../shared/config/google';
import { DEMO_SCENARIO, DEMO_CLEANUP } from '../../shared/config/demo';
import { request, removeDemoGoogleArtifact } from './googleScheduling';

export const isDemoSubject = (value: unknown): value is string => typeof value === 'string' && /^(?:(?:re|fwd?):\s*)*MEGA_TEST(?:\b|_)/i.test(value.trim());

/** Discover first, then mutate exact IDs. Never delete whole Gmail threads. */
export async function clearDemoGoogle(token: string, email: string, plans: { id: string; calendarExternalId?: string; draftId?: string }[]) {
  let mailCount = 0, eventCount = 0;
  const profile = await request(`${GMAIL.baseUrl}/profile`, token, 'GET');
  if (profile.status !== 200 || profile.data.emailAddress !== email || !DEMO_SCENARIO.personas.some(p => p.email === email)) throw new Error('Test mailbox identity could not be verified.');
  const mail: string[] = [], events = new Set<string>();
  async function pages(base: string, key: 'messages' | 'items', visit: (item: Record<string, unknown>) => Promise<void>) {
    let page: string | undefined;
    let total = 0;
    do {
      const result = await request(base + (page ? `&pageToken=${encodeURIComponent(page)}` : ''), token, 'GET');
      if (result.status !== 200) throw new Error('Google could not list test data. Check cleanup permissions.');
      for (const item of (result.data[key] ?? []) as Record<string, unknown>[]) {
        if (++total > DEMO_CLEANUP.maxItems) throw new Error('Too many results for one cleanup. No data was removed.');
        await visit(item);
      }
      page = result.data.nextPageToken as string | undefined;
    } while (page);
  }
  await pages(`${GMAIL.baseUrl}/messages?q=${encodeURIComponent('in:anywhere -in:trash subject:MEGA_TEST')}&includeSpamTrash=true&maxResults=100`, 'messages', async item => {
    const id = String(item.id);
    const full = await request(`${GMAIL.baseUrl}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject`, token, 'GET');
    if (full.status !== 200) throw new Error('Could not verify an email subject. No data was removed.');
    const headers = (full.data.payload as { headers?: { name: string; value: string }[] })?.headers ?? [];
    if (isDemoSubject(headers.find(h => h.name.toLowerCase() === 'subject')?.value)) mail.push(id);
  });
  const base = `${GOOGLE_CALENDAR.baseUrl}/calendars/primary/events`;
  await pages(`${base}?q=MEGA_TEST&maxResults=100&showDeleted=false`, 'items', async item => {
    if (isDemoSubject(item.summary) && typeof item.id === 'string') events.add(item.id);
  });
  // Explicit provenance survives a lost local plan and an ordinary human-readable event title.
  // megaPlan alone is used by real events too and is deliberately insufficient for deletion.
  await pages(`${base}?privateExtendedProperty=megaDemo%3Dtrue&maxResults=100&showDeleted=false`, 'items', async item => {
    const tags = (item.extendedProperties as { private?: Record<string, unknown> })?.private;
    if (tags?.megaDemo === 'true' && typeof tags.megaDemoRun === 'string' && tags.megaDemoRun.startsWith('run-') && typeof item.id === 'string') events.add(item.id);
  });
  try {
    for (const plan of plans) {
      if (plan.calendarExternalId) {
        if (!await removeDemoGoogleArtifact(token, 'calendar', plan.calendarExternalId, plan.id)) throw new Error('Calendar cleanup was not confirmed.');
        events.delete(plan.calendarExternalId); eventCount++;
      }
      if (plan.draftId && !await removeDemoGoogleArtifact(token, 'draft', plan.draftId, plan.id)) throw new Error('Draft cleanup was not confirmed.');
    }
    for (const id of events) {
      const result = await request(`${base}/${encodeURIComponent(id)}?sendUpdates=none`, token, 'DELETE');
      if (![200, 204, 404, 410].includes(result.status)) throw new Error('Calendar cleanup was not confirmed.');
      eventCount++;
    }
    for (const id of mail) {
      const result = await request(`${GMAIL.baseUrl}/messages/${encodeURIComponent(id)}/trash`, token, 'POST');
      if (![200, 404, 410].includes(result.status)) throw new Error('Email cleanup was not confirmed.');
      mailCount++;
    }
    return { mailCount, eventCount, error: null };
  } catch { return { mailCount, eventCount, error: 'Cleanup stopped partway through. Retry to finish remaining items.' }; }
}
