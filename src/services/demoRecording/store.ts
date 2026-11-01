/** Device-local, bounded recordings. No network transport or render-time writes. */
export const RECORDING_LIMITS = { runs: 20, entries: 5000, characters: 2_000_000, flushMs: 750 } as const;
export type RecordingContext = { runId: string; key: string; familyId: string; persona: string; memberId?: string };
export type Entry = { sequence: number; at: string; kind: string; persona: string; memberId?: string; data: unknown };
export type Recording = { version: 1; runId: string; key: string; startedAt: string; updatedAt: string; dropped: number; entries: Entry[] };
export interface Storage { read(key: string): Promise<string | null>; write(key: string, value: string): Promise<void>; keys(): Promise<string[]>; remove(key: string): Promise<void> }
const privateKey = /token|password|parentCode|secret|authorization|pendingInvite|authId/i;
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[depth limit]';
  if (typeof value === 'string') return value.replace(/https?:\/\/[^\s"<>]+/g, '[link omitted]').slice(0, 32000);
  if (Array.isArray(value)) return value.slice(0, 100).map(v => sanitize(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !privateKey.test(k)).map(([k,v]) => [k,sanitize(v,depth+1)]));
  return value;
}
export function createRecorder(storage: Storage, now = () => new Date().toISOString()) {
  let context: RecordingContext | null = null;
  let pending: { context: RecordingContext; kind: string; data: unknown; at: string }[] = [];
  let chain = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let error: string | null = null;
  const seen = new Map<string,number>();
  async function read(runId: string): Promise<Recording | null> {
    const raw = await storage.read(runId); if (!raw) return null;
    return JSON.parse(raw) as Recording;
  }
  function flush() {
    if (timer) clearTimeout(timer); timer = undefined;
    const batch = pending; pending = [];
    chain = chain.then(async () => {
      if (!batch.length) return;
      const runs = new Map<string, typeof batch>();
      for (const event of batch) { const events = runs.get(event.context.runId) ?? []; events.push(event); runs.set(event.context.runId,events); }
      for (const [id,events] of runs) {
        const first = events[0];
        const existing = await read(id);
        const record = existing ?? { version: 1 as const, runId: id, key: first.context.key, startedAt: first.at, updatedAt: first.at, dropped: 0, entries: [] };
        let sequence = record.entries.at(-1)?.sequence ?? record.dropped;
        for (const event of events) record.entries.push({ sequence: ++sequence, at: event.at, kind: event.kind, persona: event.context.persona, memberId: event.context.memberId, data: event.data });
        record.updatedAt = events.at(-1)!.at;
        while (record.entries.length > RECORDING_LIMITS.entries) { record.entries.shift(); record.dropped++; }
        let serialized = JSON.stringify(record);
        while (serialized.length > RECORDING_LIMITS.characters && record.entries.length > 1) { record.entries.splice(0, Math.min(100,record.entries.length-1)); record.dropped = sequence - record.entries.length; serialized = JSON.stringify(record); }
        await storage.write(id,serialized);
      }
      const keys = await storage.keys();
      if (keys.length > RECORDING_LIMITS.runs) {
        const dates: { runId: string; updatedAt: string }[] = [];
        for (const id of keys) { const r = await read(id); if (r) dates.push({runId:id,updatedAt:r.updatedAt}); }
        dates.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
        for (const r of dates.slice(RECORDING_LIMITS.runs)) await storage.remove(r.runId);
      }
      error = null;
    }).catch(() => { error = 'Could not save the demo log on this device.'; });
    return chain;
  }
  function event(kind: string, data: unknown = {}) {
    if (!context) return;
    const clean = sanitize(data);
    const serialized = JSON.stringify(clean);
    pending.push({ context: { ...context }, kind, data: serialized.length > 64000 ? { truncated: true, preview: serialized.slice(0, 63000) } : clean, at: now() });
    if (pending.length >= 100) void flush();
    else if (!timer) timer = setTimeout(() => void flush(), RECORDING_LIMITS.flushMs);
  }
  return {
    event, flush,
    context(next: RecordingContext | null) {
      if (context === next || (context && next && context.runId === next.runId && context.key === next.key && context.familyId === next.familyId && context.memberId === next.memberId && context.persona === next.persona)) return;
      if (context) event('session.leave');
      if (context?.runId !== next?.runId) seen.clear();
      context = next; if (next) event('session.enter', { run: next.key });
      void flush();
    },
    message(familyId: string, id: string, message: unknown) {
      if (!context || context.familyId !== familyId || id.startsWith('optimistic:')) return;
      const clean = sanitize(message); const encoded = JSON.stringify(clean);
      let fingerprint = 2166136261;
      for (let i = 0; i < encoded.length; i++) fingerprint = Math.imul(fingerprint ^ encoded.charCodeAt(i), 16777619) >>> 0;
      const key = `${context.memberId}:${id}`;
      if (seen.get(key) === fingerprint) return;
      seen.set(key,fingerprint);
      if (seen.size > 1000) seen.delete(seen.keys().next().value!);
      event('conversation.message', { id, message: clean });
    },
    async list() { await flush(); const rows: (Omit<Recording,'entries'> & {count:number})[] = []; for (const key of await storage.keys()) { const record = await read(key); if (record) { const {entries,...r} = record; rows.push({...r,count:entries.length}); } } return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)); },
    async export(runId: string) { await flush(); const r = await read(runId); if (!r) throw new Error('Recording not found on this device.'); return JSON.stringify(r,null,2); },
    async remove(runId: string) { await flush(); await storage.remove(runId); },
    status: () => ({ recording: !!context, run: context?.key, error }),
  };
}
