const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { verifiedDownload } = require('../../scripts/verified-download.cjs');
const { ensureWhisperSource } = require('../../scripts/native-source.cjs');
const { whisper } = require('../../scripts/native-artifacts.cjs');
const { setupFfmpeg } = require('../../scripts/setup-ffmpeg');

test('setup publishes only exact artifacts, follows HTTPS redirects and preserves existing files on failure', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'talatrace-download-'));
  const target = path.join(root, 'asset');
  const expected = Buffer.from('verified');
  const artifact = { url: 'https://example.test/start', sizeBytes: expected.length, sha256: crypto.createHash('sha256').update(expected).digest('hex') };
  let mode = 'redirect', calls = 0;
  const request = mock.method(https, 'get', (url, callback) => {
    calls++;
    const req = new EventEmitter(); req.setTimeout = () => {};
    queueMicrotask(() => {
      const stream = new PassThrough(); stream.headers = {};
      if (mode === 'redirect' && url.endsWith('/start')) { stream.statusCode = 302; stream.headers.location = '/file'; callback(stream); stream.end(); return; }
      stream.statusCode = mode === '404' ? 404 : mode === 'downgrade' ? 302 : 200;
      if (mode === 'downgrade') stream.headers.location = 'http://example.test/file';
      callback(stream); stream.end(mode === 'wrong' ? 'tampered' : mode === 'oversize' ? 'too-much-data' : mode === 'short' ? 'x' : expected);
    }); return req;
  });
  try {
    await verifiedDownload(artifact, target); assert.deepEqual(await fs.readFile(target), expected); assert.equal(calls, 2);
    await verifiedDownload(artifact, target); assert.equal(calls, 2, 'Verified cache should not redownload');
    for (mode of ['404', 'wrong', 'short', 'oversize', 'downgrade']) {
      await fs.writeFile(target, 'keep-existing');
      await assert.rejects(verifiedDownload(artifact, target));
      assert.equal(await fs.readFile(target, 'utf8'), 'keep-existing');
      assert.deepEqual(await fs.readdir(root), ['asset']);
    }
  } finally { request.mock.restore(); await fs.rm(root, { recursive: true, force: true }); }
});

test('native source pin clones a fixed tag and rejects unexpected revisions/edits without resetting work', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'talatrace-native-pin-'));
  const commands = [];
  let revision = whisper.commit, changes = '';
  const run = (_command, args) => {
    commands.push(args);
    if (args[0] === 'clone') { syncFs.mkdirSync(path.join(root, 'whisper.cpp')); return ''; }
    return args.includes('rev-parse') ? revision : changes;
  };
  try {
    assert.equal(ensureWhisperSource(root, run), whisper.commit);
    assert.ok(commands[0].includes(whisper.tag));
    revision = 'different'; assert.throws(() => ensureWhisperSource(root, run), /not reset/);
    revision = whisper.commit; changes = ' M CMakeLists.txt'; assert.throws(() => ensureWhisperSource(root, run), /local changes/);
    assert.ok(!commands.some(args => args.includes('reset') || args.includes('checkout')));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('FFmpeg staging validates executable/notices before replacing a usable runtime', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'talatrace-ffmpeg-stage-'));
  const destination = path.join(root, 'ffmpeg/bin/ffmpeg.exe');
  await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, 'old');
  let fail = true;
  const execute = (command, _args, options) => {
    if (command === 'powershell.exe') {
      const extracted = options.env.TALATRACE_EXTRACT;
      syncFs.mkdirSync(path.join(extracted, 'bin')); syncFs.writeFileSync(path.join(extracted, 'bin/ffmpeg.exe'), 'new');
      if (!fail) syncFs.writeFileSync(path.join(extracted, 'LICENSE.txt'), 'notice');
      return '';
    }
    return 'ffmpeg test version\n';
  };
  try {
    const options = { root, platform: 'win32', arch: 'x64', download: async () => {}, execute };
    await assert.rejects(setupFfmpeg(options), /notices missing/); assert.equal(await fs.readFile(destination, 'utf8'), 'old');
    fail = false; await setupFfmpeg(options); assert.equal(await fs.readFile(destination, 'utf8'), 'new');
    assert.ok((await fs.readdir(path.join(root, 'ffmpeg'))).every(name => !name.startsWith('.staging-')));
    assert.ok(JSON.parse(await fs.readFile(path.join(root, 'ffmpeg/version.json'))).binarySha256);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Linux FFmpeg setup selects pinned archive, runs tar and retains executable permissions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'talatrace-linux-ffmpeg-'));
  let selected;
  const execute = (command, args) => {
    if (command === 'tar') {
      const stage = args[args.indexOf('-C') + 1];
      syncFs.mkdirSync(path.join(stage, 'bin'));
      syncFs.writeFileSync(path.join(stage, 'bin/ffmpeg'), 'linux-binary');
      syncFs.writeFileSync(path.join(stage, 'LICENSE.txt'), 'notice');
      return '';
    }
    return 'ffmpeg Linux test\n';
  };
  try {
    const file = await setupFfmpeg({ root, platform: 'linux', arch: 'x64', execute, download: async artifact => { selected = artifact; } });
    assert.match(selected.filename, /linux.*tar\.xz$/);
    assert.equal(path.basename(file), 'ffmpeg');
    assert.equal(await fs.readFile(file, 'utf8'), 'linux-binary');
    if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o755);
    assert.equal(JSON.parse(await fs.readFile(path.join(root, 'ffmpeg/version.json'))).platform, 'linux');
    await assert.rejects(setupFfmpeg({ root, platform: 'linux', arch: 'arm64' }), /x64/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
