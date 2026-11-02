#!/usr/bin/env node
import { deliveryCycle } from './demo-delivery.mjs';
// The only live demo delivery worker. The app queues configured messages; credentials stay local.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, unlink, rename } from 'node:fs/promises';
import { unlinkSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
const exec = promisify(execFile);
const runtime = resolve('.demo-runtime');
const journal = resolve(runtime, 'delivery.json');
// Atomic replacement leaves either the prior journal or the complete new result after a crash.
const persistJournal = async (path, contents, options) => {
  await writeFile(`${path}.tmp`, contents, options);
  await rename(`${path}.tmp`, path);
};
const execute = async (command, args) => {
  const { stdout } = await exec(command, args, { timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : null;
};
const convex = (name, args) => execute('npx', ['convex', 'run', name, JSON.stringify(args)]);
const composio = (name, args) => execute('composio', ['execute', name, '-d', JSON.stringify(args)]);
await mkdir(runtime, { recursive: true });
if (process.argv.includes('--background')) {
  const output = openSync(resolve(runtime, 'runner.log'), 'a', 0o600);
  const child = spawn(process.execPath, [resolve('scripts/demo-runner.mjs')], { detached: true, stdio: ['ignore', output, output] });
  child.unref();
  closeSync(output);
  console.log('Runner launched. Logs: .demo-runtime/runner.log');
  process.exit(0);
}
const lock = resolve(runtime, 'runner.lock');
if (process.argv.includes('--stop')) {
  try { process.kill(Number(await readFile(lock, 'utf8')), 'SIGTERM'); console.log('Stop requested. The current delivery will finish before exit.'); }
  catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; console.log('Runner is not running.'); }
  process.exit(0);
}
try {
  const pid = Number(await readFile(lock, 'utf8'));
  try { process.kill(pid, 0); throw new Error('A demo runner is already active.'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  await unlink(lock);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
process.on('exit', () => { try { unlinkSync(lock); } catch {} });
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });
let sender;
while (!sender && !stopped) {
  try {
    const profile = await composio('GMAIL_GET_PROFILE', { user_id: 'me' });
    if (!profile?.successful || !profile.data?.emailAddress) throw new Error('No connected sender');
    sender = profile.data.emailAddress;
  } catch {
    console.error('Cannot verify Gmail sender. Check Composio connection; retrying in 15 seconds.');
    if (process.argv.includes('--once')) process.exit(1);
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}
if (stopped) process.exit(0);
console.log(`Demo email runner: ${sender}. Open Settings → Demo Console.`);
// Heartbeat independently of provider latency; never claim work from this timer.
let pulsing = false;
const pulse = async () => {
  if (pulsing || stopped) return;
  pulsing = true;
  try { await convex('demoConsole:heartbeat', { sender }); }
  catch { console.error('Heartbeat unavailable; reconnecting.'); }
  finally { pulsing = false; }
};
const heartbeat = setInterval(pulse, 15000);
let failures = 0;
do {
  try {
    await deliveryCycle({ readFile, writeFile: persistJournal, unlink, journal, convex, composio, sender, log: console.log });
    failures = 0;
  } catch {
    failures += 1;
    console.error('Runner connection interrupted; retrying safely. Pending deliveries will not be sent again.');
    if (process.argv.includes('--once')) process.exitCode = 1;
  }
  if (!process.argv.includes('--once') && !stopped) await new Promise(resolve => setTimeout(resolve, Math.min(30000, 5000 * (failures + 1))));
} while (!stopped && !process.argv.includes('--once'));

clearInterval(heartbeat);
