// Day-1 smoke tests for the Meta Model API. Run through the secrets runner so the key is never shown:
//   node scripts/secrets.mjs run --only tool -- node scripts/smoke/meta.mjs [step...]
// Steps: models chat tools json search transcribe. Prints statuses and short excerpts only.
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.META_API_BASE_URL ?? 'https://api.meta.ai/v1';
const KEY = process.env.META_API_KEY;
if (!KEY) { console.error('META_API_KEY is not set'); process.exit(2); }
const MODEL = process.env.MODEL ?? 'muse-spark-1.3';
const MAX = Number(process.env.MAX ?? 2000);
// Muse Spark is a reasoning model: hidden reasoning counts against max_tokens.
const EFFORT = process.env.EFFORT ? { reasoning_effort: process.env.EFFORT } : {};
const LOG = path.join(path.dirname(new URL(import.meta.url).pathname), 'results.json');
const results = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : {};

async function call(method, route, body, headers = {}) {
  const started = Date.now();
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, ms: Date.now() - started, json, text: text.slice(0, 600) };
}
const short = (x, n = 300) => (typeof x === 'string' ? x : JSON.stringify(x) ?? String(x)).slice(0, n);
function record(step, ok, detail) {
  results[step] = { ok, at: new Date().toISOString(), ...detail };
  console.log(`\n[${ok ? 'PASS' : 'FAIL'}] ${step}`);
  for (const [k, v] of Object.entries(detail)) console.log(`  ${k}: ${short(v, 500)}`);
}

const steps = {
  async models() {
    const r = await call('GET', '/models');
    const ids = r.json?.data?.map((m) => m.id) ?? [];
    record('models', r.status === 200, { status: r.status, ids, raw: ids.length ? '' : r.text });
  },
  async chat() {
    const r = await call('POST', '/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: MAX, ...EFFORT });
    record('chat', r.status === 200, { status: r.status, ms: r.ms, reply: r.json?.choices?.[0]?.message?.content ?? r.text, usage: r.json?.usage });
  },
  async tools() {
    const tools = [{
      type: 'function',
      function: {
        name: 'lists_add',
        description: 'Add an item to a family list',
        parameters: { type: 'object', properties: { list: { type: 'string' }, item: { type: 'string' } }, required: ['list', 'item'], additionalProperties: false },
      },
    }];
    const r = await call('POST', '/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'Add milk to the groceries list.' }], tools, tool_choice: 'auto', max_tokens: MAX, ...EFFORT });
    const tc = r.json?.choices?.[0]?.message?.tool_calls;
    record('tools', r.status === 200 && !!tc?.length, { status: r.status, ms: r.ms, tool_calls: tc ?? r.text, finish: r.json?.choices?.[0]?.finish_reason, usage: r.json?.usage });
  },
  async json() {
    const schema = { type: 'object', properties: { score: { type: 'number' }, reason: { type: 'string' } }, required: ['score', 'reason'], additionalProperties: false };
    const r = await call('POST', '/chat/completions', {
      model: MODEL,
      messages: [{ role: 'user', content: 'Rate from 0 to 1 how urgent this is for a parent: "Soccer pickup in 10 minutes".' }],
      response_format: { type: 'json_schema', json_schema: { name: 'judge', schema, strict: true } },
      max_tokens: MAX,
      ...EFFORT,
    });
    const content = r.json?.choices?.[0]?.message?.content;
    let parsed = null;
    try { parsed = JSON.parse(content); } catch {}
    record('json', r.status === 200 && typeof parsed?.score === 'number', { status: r.status, ms: r.ms, content: content ?? r.text, usage: r.json?.usage });
  },
  async search() {
    const r = await call('POST', '/responses', { model: MODEL, input: 'What is the weather forecast for New York City tomorrow? One sentence.', tools: [{ type: 'web_search' }], max_output_tokens: MAX, ...(process.env.EFFORT ? { reasoning: { effort: process.env.EFFORT } } : {}) });
    const out = r.json?.output ?? [];
    const msg = out.find((o) => o.type === 'message');
    const msgs = out.filter((o) => o.type === 'message');
    const text = msgs.flatMap((m) => m.content ?? []).map((c) => c.text ?? '').join(' ');
    const cites = msgs.flatMap((m) => m.content ?? []).flatMap((c) => c.annotations ?? []);
    record('search', r.status === 200 && text.length > 0, { status: r.status, ms: r.ms, outputTypes: out.map((o) => o.type), text: text || r.text, citations: cites.slice(0, 3), usage: r.json?.usage });
  },
  async transcribe() {
    // Meta's file endpoint (dev.meta.ai/docs/speech-to-text): multipart with a JSON `request` part and an `audio` part.
    const wav = path.join(path.dirname(LOG), 'sample.wav');
    if (!fs.existsSync(wav)) { record('transcribe', false, { error: 'missing scripts/smoke/sample.wav' }); return; }
    const settings = { model: process.env.TRANSCRIBE_MODEL ?? 'muse-voice-transcribe-1.0', audioEncoding: 'WAV', ...(process.env.STT_MODE ? { mode: process.env.STT_MODE } : {}) };
    const form = new FormData();
    form.append('request', new Blob([JSON.stringify(settings)], { type: 'application/json' }));
    form.append('audio', new Blob([fs.readFileSync(wav)], { type: 'audio/wav' }), 'sample.wav');
    const r = await call('POST', `/asr/transcribe?sessionId=smoke-${Date.now()}`, form);
    record('transcribe', r.status === 200 && !!r.json?.transcript, { status: r.status, ms: r.ms, transcript: r.json?.transcript ?? r.text, durationMs: r.json?.audioDurationMs, turns: r.json?.turns?.length });
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(steps);
for (const s of wanted) {
  try { await steps[s](); } catch (e) { record(s, false, { error: String(e) }); }
}
fs.writeFileSync(LOG, JSON.stringify(results, null, 2));
