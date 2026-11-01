#!/usr/bin/env node
// The only live demo delivery worker. The app queues configured messages; credentials stay local.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
const exec = promisify(execFile);
const runtime = resolve('.demo-runtime');
const journal = resolve(runtime, 'delivery.json');
const execute = async (command, args) => {
  const { stdout } = await exec(command, args, { timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : null;
};
const convex = (name, args) => execute('npx', ['convex', 'run', name, JSON.stringify(args)]);
const composio = (name, args) => execute('composio', ['execute', name, '-d', JSON.stringify(args)]);
await mkdir(runtime, { recursive: true });
const lock = resolve(runtime, 'runner.lock');
try {
  const pid = Number(await readFile(lock, 'utf8'));
  try { process.kill(pid, 0); throw new Error('A demo runner is already active.'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  await unlink(lock);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
process.on('exit', () => { try { unlinkSync(lock); } catch {} });
const profile = await composio('GMAIL_GET_PROFILE', { user_id: 'me' });
if (!profile?.successful || !profile.data?.emailAddress) throw new Error('Connect a configured test Gmail account in Composio first.');
const sender = profile.data.emailAddress;
console.log(`Demo email runner: ${sender}. Open Settings → Demo Console. Ctrl+C to stop.`);
// A crash after sending is recovered by recording the known result, never by sending again.
const saved = await readFile(journal, 'utf8').catch(() => null);
if (saved) {
  const prior = JSON.parse(saved);
  await convex('demoConsole:finish', prior.result ?? { runId: prior.runId, stage: prior.stage, attempt: prior.attempt, error: 'Runner interrupted; delivery unknown. Inspect this run’s exact subject in Gmail. No resend attempted.' });
  await unlink(journal);
}
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });
do {
  try {
    const job = await convex('demoConsole:claim', { sender });
    if (job) {
      await writeFile(journal, JSON.stringify(job), { mode: 0o600 });
      let result;
      try {
        const sent = await composio('GMAIL_SEND_EMAIL', { user_id: 'me', from_email: sender, recipient_email: job.recipient, cc: job.cc, subject: job.subject, body: job.body, is_html: false, include_signature: false });
        if (!sent?.successful || !sent.data?.id) throw new Error('Provider did not confirm a message id.');
        result = { runId: job.runId, stage: job.stage, attempt: job.attempt, messageId: sent.data.id };
      } catch { result = { runId: job.runId, stage: job.stage, attempt: job.attempt, error: 'Delivery not confirmed. Inspect Gmail before retrying; no automatic resend.' }; }
      await writeFile(journal, JSON.stringify({ ...job, result }), { mode: 0o600 });
      await convex('demoConsole:finish', result);
      await unlink(journal);
      console.log(`${job.stage}: ${result.messageId ? 'sent' : 'uncertain'}`);
    }
  } catch (error) {
    // If an acknowledgement failed, stop. Startup replays only that acknowledgement.
    console.error('Demo runner stopped:', error.message); process.exitCode = 1; break;
  }
  if (!process.argv.includes('--once') && !stopped) await new Promise(resolve => setTimeout(resolve, 5000));
} while (!stopped && !process.argv.includes('--once'));
