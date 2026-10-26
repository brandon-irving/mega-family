#!/usr/bin/env node
// Uses the values in .env.secrets without ever printing them.
//
//   node scripts/secrets.mjs init [--prune]       create .env.secrets (or add missing names); --prune removes
//                                                 empty names no longer in the manifest; never touches values
//   node scripts/secrets.mjs status               which vars are set or missing (names only)
//   node scripts/secrets.mjs gen <NAME>           generate a random value for a var marked "generate"
//   node scripts/secrets.mjs apple-key <file.p8>  store the Sign in with Apple key (base64) and its key id
//   node scripts/secrets.mjs sync-convex [--prod] push the convex-target vars to the Convex deployment
//   node scripts/secrets.mjs run [--only app] -- <cmd...>
//                                                 run a command with the vars in its environment;
//                                                 its output is redacted
//
// The list of vars lives in scripts/env.manifest.json. SECRETS_FILE overrides the file path (used by tests).
// SECRETS_CONVEX_CMD overrides the Convex CLI (used by tests).

import { spawn } from 'node:child_process';
import { createPrivateKey, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(here, 'env.manifest.json'), 'utf8')).vars;
const FILE = process.env.SECRETS_FILE ? path.resolve(process.env.SECRETS_FILE) : path.join(root, '.env.secrets');
const MIN_REDACT_LEN = 6; // shorter values ("true", "1") would redact ordinary words
const IDLE_FLUSH_MS = 200;

// ---------- the file ----------

/** Parses KEY=value lines. Supports # comments, blank lines, and single or double quotes. */
export function parseEnv(text) {
  const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    const quoted = value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0];
    if (quoted) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    out.set(key, value);
  }
  return out;
}

function readSecrets() {
  if (!fs.existsSync(FILE)) fail(`No secrets file at ${rel(FILE)}. Run: node scripts/secrets.mjs init`);
  return parseEnv(fs.readFileSync(FILE, 'utf8'));
}

/** Vars from the manifest that have a non-empty value, optionally filtered by target. */
function setVars(secrets, targets) {
  return MANIFEST.filter((v) => (!targets || v.targets.some((t) => targets.includes(t))) && secrets.get(v.name))
    .map((v) => ({ name: v.name, value: secrets.get(v.name) }));
}

/** The environment a command gets. App-target vars use their appName (EXPO_PUBLIC_…) so Expo exposes them. */
function envFor(secrets, only) {
  const env = {};
  for (const v of MANIFEST) {
    const value = secrets.get(v.name);
    if (!value) continue;
    const targets = only ? v.targets.filter((t) => only.includes(t)) : v.targets;
    if (targets.some((t) => t !== 'app')) env[v.name] = value;
    if (targets.includes('app')) env[v.appName ?? v.name] = value;
  }
  return env;
}

/** Everything to hide from output: each value, plus the decoded form of encoded values (line by line). */
function redactionList(secrets) {
  const list = setVars(secrets);
  for (const v of MANIFEST.filter((x) => x.decode === 'base64' && secrets.get(x.name))) {
    const decoded = Buffer.from(secrets.get(v.name), 'base64').toString('utf8');
    list.push({ name: v.name, value: decoded });
    for (const line of decoded.split(/\r?\n/)) if (!line.startsWith('-----')) list.push({ name: v.name, value: line.trim() });
  }
  return list;
}

/** Sets NAME=value in the file, replacing an existing line or appending one. */
function setValue(name, value) {
  const text = fs.readFileSync(FILE, 'utf8');
  const re = new RegExp(`^(\\s*(?:export\\s+)?${name}\\s*=).*$`, 'm');
  writeAtomic(FILE, re.test(text) ? text.replace(re, (_, k) => k + value) : `${text.replace(/\n?$/, '\n')}${name}=${value}\n`);
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}

// ---------- redaction ----------

/** Streams text through, replacing every secret value (and its URL-encoded form) with [REDACTED:NAME].
 *  Any tail that could be the start of a secret is held back. When output pauses (or ends) with a held
 *  tail, at most MIN_REDACT_LEN - 1 characters of it are ever shown, and the tail stays buffered so a
 *  value that resumes after the pause is still matched and masked.
 *  Scope: this stops accidental printing. A child that deliberately transforms a value (reverses it,
 *  prints it in slices) can't be stopped by output filtering; only run commands you trust. */
export class Redactor {
  constructor(vars) {
    this.needles = [];
    for (const { name, value } of vars) {
      if (!value || value.length < MIN_REDACT_LEN) continue;
      for (const form of new Set([value, encodeURIComponent(value)])) this.needles.push({ form, label: `[REDACTED:${name}]` });
    }
    this.needles.sort((a, b) => b.form.length - a.form.length);
    this.buf = ''; // held text not yet known to be safe
    this.shown = 0; // how much of buf has already been written (as raw or as a PARTIAL mask)
  }

  /** Non-overlapping matches in text as [start, end, label], longest needles first. */
  matches(text) {
    const ranges = [];
    for (const { form, label } of this.needles) {
      for (let i = text.indexOf(form); i !== -1; i = text.indexOf(form, i + 1)) {
        const end = i + form.length;
        if (!ranges.some(([s, e]) => i < e && end > s)) ranges.push([i, end, label]);
      }
    }
    return ranges.sort((a, b) => a[0] - b[0]);
  }

  /** Length of the longest suffix of text that is a proper prefix of some secret. */
  heldTail(text) {
    let hold = 0;
    for (const { form } of this.needles) {
      for (let n = Math.min(form.length - 1, text.length); n > hold; n--) {
        if (text.endsWith(form.slice(0, n))) { hold = n; break; }
      }
    }
    return hold;
  }

  push(chunk) {
    const text = this.buf + chunk;
    const ranges = this.matches(text);
    const lastEnd = ranges.length ? ranges.at(-1)[1] : 0;
    const cut = text.length - this.heldTail(text.slice(lastEnd));
    let out = '';
    let pos = this.shown;
    for (const [s, e, label] of ranges) {
      if (e <= this.shown) continue;
      if (s > pos) out += text.slice(pos, s);
      out += label;
      pos = Math.max(pos, e);
    }
    if (cut > pos) out += text.slice(pos, cut);
    this.shown = Math.max(0, Math.max(pos, this.shown) - cut);
    this.buf = text.slice(cut);
    return out;
  }

  /** Called when output goes idle or ends. Shows a short held tail as is (it's < MIN_REDACT_LEN, so it
   *  can't reveal more than that); a longer one is masked. The tail stays buffered for later matching. */
  flush() {
    if (this.shown >= this.buf.length) return '';
    const pending = this.buf.slice(this.shown);
    this.shown = this.buf.length;
    return this.buf.length < MIN_REDACT_LEN ? pending : '[REDACTED:PARTIAL]';
  }
}

function pipeRedacted(stream, out, vars) {
  const r = new Redactor(vars);
  let idle;
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    clearTimeout(idle);
    out.write(r.push(chunk));
    idle = setTimeout(() => out.write(r.flush()), IDLE_FLUSH_MS);
  });
  return new Promise((resolve) => stream.on('end', () => { clearTimeout(idle); out.write(r.flush()); resolve(); }));
}

/** Runs a command with extra env; stdout and stderr are redacted. Resolves to the exit code. */
async function runRedacted(cmd, args, env, vars, input) {
  const child = spawn(cmd, args, { cwd: process.cwd(), env: { ...process.env, ...env }, stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'] });
  if (input !== undefined) child.stdin.end(input);
  const forward = (sig) => child.kill(sig);
  process.on('SIGINT', forward);
  process.on('SIGTERM', forward);
  const done = Promise.all([pipeRedacted(child.stdout, process.stdout, vars), pipeRedacted(child.stderr, process.stderr, vars)]);
  const code = await new Promise((resolve) => {
    child.on('error', (e) => { process.stderr.write(`secrets: could not start ${cmd}: ${e.code ?? e.message}\n`); resolve(127); });
    child.on('close', (c, sig) => resolve(c ?? (sig ? 128 : 1)));
  });
  await done;
  process.off('SIGINT', forward);
  process.off('SIGTERM', forward);
  return code;
}

// ---------- commands ----------

function init(prune) {
  const existing = fs.existsSync(FILE) ? parseEnv(fs.readFileSync(FILE, 'utf8')) : new Map();
  if (prune && fs.existsSync(FILE)) {
    const known = new Set(MANIFEST.map((v) => v.name));
    const lines = fs.readFileSync(FILE, 'utf8').split('\n');
    const keep = [];
    const removed = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
      if (!m || known.has(m[1])) { keep.push(line); continue; }
      if (parseEnv(line).get(m[1])) { console.log(`Kept ${m[1]}: it has a value but isn't in the manifest. Remove it by hand.`); keep.push(line); continue; }
      removed.push(m[1]);
      if (keep.at(-1)?.startsWith('#')) keep.pop(); // its help comment
      if (lines[i + 1] === '') i++; // and the blank line after it
    }
    if (removed.length) { writeAtomic(FILE, keep.join('\n')); console.log(`Removed unused empty name(s): ${removed.join(', ')}`); }
  }
  const missing = MANIFEST.filter((v) => !existing.has(v.name));
  if (!fs.existsSync(FILE)) {
    const header = [
      '# MEGA secrets. Fill in values after the "=". This file is gitignored and is never printed.',
      '# Check with: node scripts/secrets.mjs status',
      '',
    ];
    writeAtomic(FILE, header.join('\n') + '\n');
  }
  if (missing.length) {
    const lines = missing.flatMap((v) => [`# ${v.help} (needed at ${v.gate})`, `${v.name}=`, '']);
    fs.appendFileSync(FILE, lines.join('\n'));
  }
  fs.chmodSync(FILE, 0o600);
  console.log(`${rel(FILE)}: ${missing.length ? `added ${missing.length} name(s): ${missing.map((v) => v.name).join(', ')}` : 'all names present'}`);
}

function status() {
  const secrets = readSecrets();
  const rows = MANIFEST.map((v) => [v.name, secrets.get(v.name) ? 'set' : 'missing', v.targets.join(','), v.gate]);
  const w = rows.reduce((m, r) => r.map((c, i) => Math.max(m[i] ?? 0, c.length)), []);
  console.log(['NAME', 'STATUS', 'TARGET', 'GATE'].map((h, i) => h.padEnd(w[i])).join('  '));
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(w[i])).join('  '));
  const unknown = [...secrets.keys()].filter((k) => !MANIFEST.some((v) => v.name === k));
  if (unknown.length) console.log(`\nNot in the manifest (ignored): ${unknown.join(', ')}`);
  const short = MANIFEST.filter((v) => secrets.get(v.name) && secrets.get(v.name).length < MIN_REDACT_LEN).map((v) => v.name);
  if (short.length) console.log(`\nWarning: too short to redact from output (under ${MIN_REDACT_LEN} characters): ${short.join(', ')}`);
  const mode = fs.statSync(FILE).mode & 0o777;
  if (mode & 0o077) console.log(`\nWarning: ${rel(FILE)} is readable by others (mode ${mode.toString(8)}). Run: chmod 600 ${rel(FILE)}`);
}

function gen(name, force) {
  const v = MANIFEST.find((x) => x.name === name);
  if (!v) fail(`${name} is not in scripts/env.manifest.json`);
  if (!v.generate) fail(`${name} can't be generated; it comes from a provider`);
  if (readSecrets().get(name) && !force) fail(`${name} is already set (use --force to replace it)`);
  setValue(name, randomBytes(32).toString('base64url'));
  console.log(`${name}: generated (value not shown)`);
}

function appleKey(file) {
  if (!file || !fs.existsSync(file)) fail('Usage: node scripts/secrets.mjs apple-key <path to AuthKey_XXXXXXXXXX.p8>');
  const pem = fs.readFileSync(file, 'utf8');
  let key;
  try { key = createPrivateKey(pem); } catch { fail(`${path.basename(file)} is not a readable private key`); }
  if (key.asymmetricKeyType !== 'ec') fail(`${path.basename(file)} is not an Apple (EC P-256) key`);
  readSecrets();
  setValue('APPLE_PRIVATE_KEY_B64', Buffer.from(pem.trim() + '\n').toString('base64'));
  console.log('APPLE_PRIVATE_KEY_B64: stored (value not shown)');
  const keyId = path.basename(file).match(/^AuthKey_([A-Z0-9]{10})\.p8$/)?.[1];
  if (keyId && !readSecrets().get('APPLE_KEY_ID')) { setValue('APPLE_KEY_ID', keyId); console.log(`APPLE_KEY_ID: set to ${keyId} (from the file name)`); }
  console.log(`You can now move ${path.basename(file)} somewhere safe (e.g. a password manager) and delete it from Downloads.`);
}

async function syncConvex(extra) {
  const secrets = readSecrets();
  const vars = setVars(secrets, ['convex']);
  if (!vars.length) fail('No convex-target vars are set yet. See: node scripts/secrets.mjs status');
  // The values go to the Convex CLI on stdin (`npx convex env set --force < file` in the Convex docs),
  // so no copy of them is ever written to disk.
  const input = vars.map((v) => `${v.name}=${JSON.stringify(v.value)}`).join('\n') + '\n';
  const [cmd, ...pre] = (process.env.SECRETS_CONVEX_CMD ?? 'npx convex').split(' ');
  console.log(`Setting on Convex: ${vars.map((v) => v.name).join(', ')}`);
  const code = await runRedacted(cmd, [...pre, 'env', 'set', '--force', ...extra], {}, redactionList(secrets), input);
  if (code !== 0) fail(`Convex CLI exited with ${code}`, code);
}

async function run(argv) {
  const sep = argv.indexOf('--');
  if (sep < 0 || sep === argv.length - 1) fail('Usage: node scripts/secrets.mjs run [--only app|convex|tool] -- <cmd...>');
  const opts = argv.slice(0, sep);
  const only = opts.includes('--only') ? opts[opts.indexOf('--only') + 1]?.split(',') : null;
  const secrets = readSecrets();
  const [cmd, ...args] = argv.slice(sep + 1);
  // redact every known secret, even ones not passed to this command
  process.exitCode = await runRedacted(cmd, args, envFor(secrets, only), redactionList(secrets));
}

// ---------- main ----------

function rel(p) { return path.relative(process.cwd(), p) || p; }
function fail(msg, code = 1) { console.error(`secrets: ${msg}`); process.exit(code); }

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'init': init(rest.includes('--prune')); break;
    case 'status': status(); break;
    case 'gen': gen(rest[0], rest.includes('--force')); break;
    case 'apple-key': appleKey(rest[0]); break;
    case 'sync-convex': await syncConvex(rest); break;
    case 'run': await run(rest); break;
    default: fail('Commands: init [--prune] | status | gen <NAME> | apple-key <file.p8> | sync-convex [--prod] | run [--only <targets>] -- <cmd...>');
  }
}
