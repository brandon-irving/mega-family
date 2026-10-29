// Tests for scripts/secrets.mjs. Uses throwaway random values in a temp file; the real .env.secrets is never read.
// Run: node --test scripts/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes, verify } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseEnv, Redactor } from './secrets.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, 'secrets.mjs');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(here, 'env.manifest.json'), 'utf8')).vars;

const fake = (prefix = '') => prefix + randomBytes(18).toString('base64url');
let dir, file;
const values = {
  META_API_KEY: fake('meta_'),
  GOOGLE_CLIENT_SECRET: fake('g/s+') + '=&?', // characters that change under URL-encoding
  GOOGLE_IOS_CLIENT_ID: fake('ios-'),
};

function cli(args, env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, SECRETS_FILE: file, ...env },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout + r.stderr };
}
const nodeRun = (code, extra = []) => cli(['run', ...extra, '--', process.execPath, '-e', code]);

function assertNoValues(out) {
  for (const [name, v] of Object.entries(values)) {
    assert.ok(!out.includes(v), `${name} leaked in output`);
    assert.ok(!out.includes(encodeURIComponent(v)), `${name} leaked URL-encoded`);
    assert.ok(!out.includes(v.slice(0, 12)), `a prefix of ${name} leaked`);
  }
}

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mega-secrets-test-'));
  file = path.join(dir, '.env.secrets');
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('init', () => {
  test('creates the file with every manifest name, empty values, mode 600', () => {
    const r = cli(['init']);
    assert.equal(r.code, 0, r.out);
    const parsed = parseEnv(fs.readFileSync(file, 'utf8'));
    for (const v of MANIFEST) assert.equal(parsed.get(v.name), '', v.name);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  });

  test('re-running keeps existing values and adds no duplicates', () => {
    let text = fs.readFileSync(file, 'utf8');
    for (const [k, v] of Object.entries(values)) text = text.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`);
    fs.writeFileSync(file, text);
    assert.equal(cli(['init']).code, 0);
    const after = fs.readFileSync(file, 'utf8');
    const parsed = parseEnv(after);
    for (const [k, v] of Object.entries(values)) assert.equal(parsed.get(k), v);
    for (const v of MANIFEST) assert.equal(after.match(new RegExp(`^${v.name}=`, 'gm')).length, 1, v.name);
  });
});

describe('status', () => {
  test('reports set and missing by name, never values', () => {
    const r = cli(['status']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /META_API_KEY\s+set/);
    assert.match(r.out, /MAPBOX_TOKEN\s+missing/);
    assertNoValues(r.out);
  });

  test('warns when the file is readable by others', () => {
    fs.chmodSync(file, 0o644);
    assert.match(cli(['status']).out, /readable by others/);
    fs.chmodSync(file, 0o600);
  });
});

describe('run', () => {
  test('passes vars to the command and redacts them from stdout', () => {
    const r = nodeRun('console.log("key=" + process.env.META_API_KEY)');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /key=\[REDACTED:META_API_KEY\]/);
    assertNoValues(r.out);
  });

  test('redacts stderr and URL-encoded values', () => {
    const r = nodeRun('console.error(process.env.GOOGLE_CLIENT_SECRET); console.log(encodeURIComponent(process.env.GOOGLE_CLIENT_SECRET))');
    assert.equal(r.out.match(/\[REDACTED:GOOGLE_CLIENT_SECRET\]/g).length, 2);
    assertNoValues(r.out);
  });

  test('redacts a value split across separate writes', () => {
    const r = nodeRun(`const v = process.env.META_API_KEY;
      process.stdout.write("a" + v.slice(0, 9));
      setTimeout(() => process.stdout.write(v.slice(9) + "b\\n"), 60);`);
    assert.match(r.out, /a\[REDACTED:META_API_KEY\]b/);
    assertNoValues(r.out);
  });

  test('masks a partial value left at the end of the output', () => {
    const r = nodeRun('process.stdout.write("x" + process.env.META_API_KEY.slice(0, 14))');
    assert.match(r.out, /x\[REDACTED:PARTIAL\]/);
    assertNoValues(r.out);
  });

  test('passes the exit code through', () => {
    assert.equal(nodeRun('process.exit(7)').code, 7);
  });

  test('--only app passes only app vars, under their EXPO_PUBLIC_ names', () => {
    const r = nodeRun('console.log([process.env.META_API_KEY, process.env.GOOGLE_IOS_CLIENT_ID, process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID].map((x) => String(!!x)).join(" "))', ['--only', 'app']);
    assert.match(r.out, /false false true/);
  });

  test('without --only a var with both targets is passed under both names', () => {
    const r = nodeRun('console.log(process.env.GOOGLE_IOS_CLIENT_ID === process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID && !!process.env.META_API_KEY)');
    assert.match(r.out, /true/);
  });

  test('still redacts vars it did not pass', () => {
    const v = values.META_API_KEY;
    const r = cli(['run', '--only', 'app', '--', process.execPath, '-e', `console.log(${JSON.stringify(v)})`]);
    assertNoValues(r.out);
  });
});

describe('Redactor', () => {
  test('a value interrupted by a flush (pause) is still masked when it resumes', () => {
    const v = values.META_API_KEY;
    const r = new Redactor([{ name: 'K', value: v }]);
    const out = r.push(v.slice(0, 3)) + r.flush() + r.push(v.slice(3) + ' after') + r.flush();
    assert.equal(out, `${v.slice(0, 3)}[REDACTED:K] after`);
  });

  test('streams byte by byte without leaking', () => {
    const v = values.META_API_KEY;
    const r = new Redactor([{ name: 'K', value: v }]);
    let out = '';
    for (const ch of `before ${v} after`) out += r.push(ch);
    out += r.flush();
    assert.equal(out, 'before [REDACTED:K] after');
  });

  test('ignores values too short to redact safely', () => {
    const r = new Redactor([{ name: 'FLAG', value: 'true' }]);
    assert.equal(r.push('true story') + r.flush(), 'true story');
  });
});

describe('gen', () => {
  test('generates a value without printing it, and refuses to overwrite', () => {
    const r = cli(['gen', 'BETTER_AUTH_SECRET']);
    assert.equal(r.code, 0, r.out);
    const v = parseEnv(fs.readFileSync(file, 'utf8')).get('BETTER_AUTH_SECRET');
    assert.equal(v.length, 43);
    assert.ok(!r.out.includes(v));
    assert.notEqual(cli(['gen', 'BETTER_AUTH_SECRET']).code, 0);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    values.BETTER_AUTH_SECRET = v;
  });

  test('refuses vars that come from a provider', () => {
    assert.notEqual(cli(['gen', 'META_API_KEY']).code, 0);
  });
});

describe('sync-convex', () => {
  const tmpDirs = () => fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('mega-secrets-'));

  test('sends only convex-target vars on stdin, writes nothing to disk, and redacts the CLI output', () => {
    const record = path.join(dir, 'record.json');
    const fakeConvex = path.join(dir, 'fake-convex.mjs');
    fs.writeFileSync(fakeConvex, `
      import fs from 'node:fs';
      const text = fs.readFileSync(0, 'utf8'); // stdin
      fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ args: process.argv.slice(2), names: text.trim().split('\\n').map((l) => l.split('=')[0]) }));
      process.stdout.write(text); // a noisy CLI: the wrapper must redact this
    `);
    const before = tmpDirs();
    const r = cli(['sync-convex', '--prod'], { SECRETS_CONVEX_CMD: `${process.execPath} ${fakeConvex}` });
    assert.equal(r.code, 0, r.out);
    const rec = JSON.parse(fs.readFileSync(record, 'utf8'));
    assert.deepEqual(rec.args, ['env', 'set', '--force', '--prod']);
    assert.deepEqual(rec.names.sort(), ['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_IOS_CLIENT_ID', 'META_API_KEY']);
    assert.deepEqual(tmpDirs(), before, 'a temp copy of the secrets was written');
    assertNoValues(r.out);
  });

  test('derives APPLE_CLIENT_SECRET (an ES256 JWT, 180 days) from the Apple values and redacts it', () => {
    // Convex can't finish async work started at module load, so the server can't sign this JWT itself at
    // startup (found Oct 29: Apple sign-in always failed with CLIENT_ID_AND_SECRET_REQUIRED). sync-convex signs
    // it here, where the key lives, and sends it with the other values.
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const original = fs.readFileSync(file, 'utf8');
    const apple = { APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEYID12345', APPLE_CLIENT_ID: 'com.example.mega.web', APPLE_PRIVATE_KEY_B64: Buffer.from(pem).toString('base64') };
    let text = original;
    for (const [k, v] of Object.entries(apple)) text = text.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`);
    fs.writeFileSync(file, text);
    try {
      const record = path.join(dir, 'record-apple.json');
      const fakeConvex = path.join(dir, 'fake-convex-apple.mjs');
      fs.writeFileSync(fakeConvex, `
        import fs from 'node:fs';
        const text = fs.readFileSync(0, 'utf8');
        fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify(text.trim().split('\\n')));
        process.stdout.write(text);
      `);
      const r = cli(['sync-convex'], { SECRETS_CONVEX_CMD: `${process.execPath} ${fakeConvex}` });
      assert.equal(r.code, 0, r.out);
      const line = JSON.parse(fs.readFileSync(record, 'utf8')).find((l) => l.startsWith('APPLE_CLIENT_SECRET='));
      assert.ok(line, 'APPLE_CLIENT_SECRET was not sent');
      const jwt = JSON.parse(line.slice('APPLE_CLIENT_SECRET='.length));
      const [h, p, s] = jwt.split('.');
      const header = JSON.parse(Buffer.from(h, 'base64url').toString());
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
      assert.deepEqual(header, { alg: 'ES256', kid: 'KEYID12345' });
      assert.equal(payload.iss, 'TEAM123456');
      assert.equal(payload.sub, 'com.example.mega.web');
      assert.equal(payload.aud, 'https://appleid.apple.com');
      const days = (payload.exp - payload.iat) / 86400;
      assert.ok(days > 170 && days <= 180, `expires in ${days} days`);
      assert.ok(verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), 'signature does not verify');
      assert.ok(!r.out.includes(s), 'the JWT leaked in the output');
    } finally {
      fs.writeFileSync(file, original);
    }
  });

  test('passes a failing exit code through', () => {
    const failing = path.join(dir, 'failing-convex.mjs');
    fs.writeFileSync(failing, `process.stdin.resume(); process.stdin.on('end', () => process.exit(3));`);
    assert.equal(cli(['sync-convex'], { SECRETS_CONVEX_CMD: `${process.execPath} ${failing}` }).code, 3);
  });
});

describe('pauses mid-value (found in the G0 review)', () => {
  // A child that prints part of a value, goes quiet longer than the idle flush, then prints the rest.
  for (const split of [1, 3, 5, 6, 12, 30]) {
    test(`a value split after ${split} chars with a 400 ms pause shows at most 5 chars of it`, () => {
      const r = nodeRun(`const v = process.env.META_API_KEY;
        process.stdout.write("<" + v.slice(0, ${split}));
        setTimeout(() => process.stdout.write(v.slice(${split}) + ">\\n"), 400);`);
      const v = values.META_API_KEY;
      assert.ok(!r.out.includes(v.slice(5, 11)), 'text after the first 5 chars leaked');
      assert.ok(!r.out.includes(v.slice(-6)), 'the end of the value leaked');
      assert.match(r.out, /REDACTED/);
    });
  }

  test('two pauses in a row still mask the rest', () => {
    const r = nodeRun(`const v = process.env.META_API_KEY;
      process.stdout.write(v.slice(0, 2));
      setTimeout(() => process.stdout.write(v.slice(2, 4)), 300);
      setTimeout(() => process.stdout.write(v.slice(4) + "\\n"), 600);`);
    assert.ok(!r.out.includes(values.META_API_KEY.slice(5, 11)));
    assert.ok(!r.out.includes(values.META_API_KEY.slice(-6)));
  });
});

describe('status warnings', () => {
  test('warns about values too short to redact', () => {
    const text = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, text.replace(/^MAPBOX_TOKEN=.*$/m, 'MAPBOX_TOKEN=ab12c'));
    assert.match(cli(['status']).out, /too short to redact.*MAPBOX_TOKEN/s);
    fs.writeFileSync(file, text);
  });
});

describe('apple-key', () => {
  test('stores the .p8 as base64, sets the key id from the file name, and redacts the decoded key', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const p8 = path.join(dir, 'AuthKey_ABCDE12345.p8');
    fs.writeFileSync(p8, pem);
    const r = cli(['apple-key', p8]);
    assert.equal(r.code, 0, r.out);
    const parsed = parseEnv(fs.readFileSync(file, 'utf8'));
    const b64 = parsed.get('APPLE_PRIVATE_KEY_B64');
    assert.equal(Buffer.from(b64, 'base64').toString('utf8').trim(), pem.trim());
    assert.equal(parsed.get('APPLE_KEY_ID'), 'ABCDE12345');
    const keyLines = pem.split('\n').filter((l) => l && !l.startsWith('-----'));
    assert.ok(!keyLines.some((l) => r.out.includes(l)));
    const shown = nodeRun('console.log(Buffer.from(process.env.APPLE_PRIVATE_KEY_B64, "base64").toString())');
    assert.ok(!keyLines.some((l) => shown.out.includes(l)), 'decoded key leaked');
    assert.ok(!shown.out.includes(b64));
  });

  test('rejects a key that is not an Apple EC key', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const p8 = path.join(dir, 'rsa.p8');
    fs.writeFileSync(p8, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    assert.notEqual(cli(['apple-key', p8]).code, 0);
  });
});

describe('init --prune', () => {
  test('removes empty names no longer in the manifest, keeps ones with values', () => {
    fs.appendFileSync(file, '# old help\nOLD_EMPTY=\n\nOLD_FILLED=keepme123\n');
    const r = cli(['init', '--prune']);
    assert.equal(r.code, 0, r.out);
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!text.includes('OLD_EMPTY') && !text.includes('# old help'));
    assert.match(text, /^OLD_FILLED=keepme123$/m);
    assert.equal(parseEnv(text).get('META_API_KEY'), values.META_API_KEY);
  });
});

describe('repo safety', () => {
  test('.env.secrets is gitignored', () => {
    const r = spawnSync('git', ['check-ignore', '-q', '.env.secrets'], { cwd: path.join(here, '..') });
    assert.equal(r.status, 0);
  });
});
