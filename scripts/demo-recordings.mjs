#!/usr/bin/env node
// Read-only device debugging. Connects only to the local Metro inspector; never uploads logs.
import { writeFile, readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import WebSocket from 'ws';
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
// A paired iPhone can expose its saved app files even when Hermes is unresponsive.
if (value('--ios-device')) {
  const temporary = await mkdtemp(join(tmpdir(), 'mega-demo-logs-'));
  try {
    const run = value('--run');
    if (run && !value('--out')) throw new Error('Use --run RUN_ID --out /path/to/recording.json.');
    const destination = join(temporary, run ? 'recording.json' : 'recordings');
    await promisify(execFile)('xcrun', ['devicectl','device','copy','from','--device',value('--ios-device'),'--domain-type','appDataContainer','--domain-identifier','com.megafamily.app','--source', run ? `Documents/demo-recordings/${encodeURIComponent(run)}.json` : 'Documents/demo-recordings','--destination',destination,'--timeout','20'], {timeout:25000});
    if (run) {
      const text = await readFile(destination,'utf8'); JSON.parse(text);
      await writeFile(value('--out'),text,{mode:0o600,flag:'wx'});
      console.log(`Saved device recording to ${value('--out')}`);
    } else {
      const rows = [];
      for (const name of await readdir(destination)) if (name.endsWith('.json')) {
        const {entries,...record} = JSON.parse(await readFile(join(destination,name),'utf8'));
        rows.push({...record,count:entries.length});
      }
      console.log(JSON.stringify(rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),null,2));
    }
  } finally { await rm(temporary,{recursive:true,force:true}); }
  process.exit(0);
}
const port = Number(value('--port') ?? 8082);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Metro port.');
const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
const candidates = targets.filter(t => t.appId === 'com.megafamily.app' && (!value('--device') || t.id === value('--device')));
if (candidates.length !== 1) throw new Error(`Expected one MEGA device. Use --device with an id from localhost:${port}/json/list.`);
const url = new URL(candidates[0].webSocketDebuggerUrl);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Inspector must be local.');
url.hostname = '127.0.0.1';
const socket = new WebSocket(url, { origin: `http://localhost:${port}` });
await new Promise((resolve,reject) => {
  const timeout = setTimeout(() => { socket.close(); reject(new Error('Phone inspector connection timed out.')); }, 10000);
  socket.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});
  socket.addEventListener('error',event=>{clearTimeout(timeout);reject(new Error(event.message || 'Could not connect to phone inspector.'));},{once:true});
});
let nextId = 0;
const evaluate = expression => new Promise((resolve,reject) => {
  const id = ++nextId;
  const timeout = setTimeout(() => { socket.removeEventListener('message',listener); reject(new Error('Phone debugger did not respond. Keep MEGA open and the phone unlocked.')); },15000);
  const listener = event => {
    const response = JSON.parse(event.data); if (response.id !== id) return;
    clearTimeout(timeout); socket.removeEventListener('message',listener);
    if (response.error || response.result?.exceptionDetails) reject(new Error(JSON.stringify(response.error ?? response.result.exceptionDetails)));
    else resolve(response.result?.result?.value);
  };
  socket.addEventListener('message',listener);
  socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));
});
try {
  if (!await evaluate('Boolean(globalThis.__MEGA_DEMO_LOGS__)')) throw new Error('Reload the updated development app to enable demo recordings.');
  const run = value('--run');
  if (run) {
    const out = value('--out'); if (!out) throw new Error('Use --run RUN_ID --out /path/to/recording.json.');
    const text = await evaluate(`globalThis.__MEGA_DEMO_LOGS__.export(${JSON.stringify(run)})`);
    if (typeof text !== 'string') throw new Error('The debugger did not return the recording. Use Copy recording in Demo Console.');
    await writeFile(out,text,{mode:0o600,flag:'wx'});
    console.log(`Saved device recording to ${out}`);
  } else console.log(JSON.stringify(await evaluate('globalThis.__MEGA_DEMO_LOGS__.list()'),null,2));
} finally { socket.close(); }
