const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const { SPEECH_MODELS, speechModel } = require('../../dist/electron/services/model-catalog');
const { ModelStore } = require('../../dist/electron/services/model-store');
const { parseTransducerTranscript } = require('../../dist/electron/services/transducer-transcript');
const { alignmentPreset } = require('../../dist/electron/services/speech-alignment');
const { TranscribeEngine } = require('../../dist/electron/services/transcribe-engine');
const { referencePerformance } = require('../../dist/electron/services/model-benchmarks');

test('reference badges distinguish measurements from an unknown model and do not invent rankings', () => {
  assert.deepEqual(referencePerformance('not-evaluated'), { speed: 'Not measured', accuracy: 'Not measured' });
  assert.equal(referencePerformance('base').accuracy, referencePerformance('small').accuracy);
  assert.equal(referencePerformance('tiny').speed, '4.4× real time');
  assert.ok(referencePerformance('tiny').speedRatio > 4.4);
  assert.equal(referencePerformance('tiny').wordErrorRate, 13/265);
  assert.equal(referencePerformance('parakeet-tdt-0.6b-v3').accuracy, '1.9% errors');
});

test('alternate engine rejects unsupported languages and translation before touching audio', async () => {
  let converted = false;
  const engine = new TranscribeEngine('/missing-runtime', new ModelStore('/unused'), async () => { converted = true; });
  const model = 'parakeet-tdt-0.6b-v3';
  await assert.rejects(engine.transcribe('/answer.wav', { model, language: 'ja' }), /language is not supported/);
  await assert.rejects(engine.transcribe('/answer.wav', { model, translate: true }), /does not translate/);
  assert.equal(converted, false);
});

test('Parakeet logs lifecycle and native diagnostics without mixing transcript JSON into logs', async () => {
  const processes = require('node:child_process');
  const chunks = require('../../dist/electron/services/parakeet-chunks');
  for (const exitCode of [0, 7]) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'parakeet-log-test-'));
    const wav = path.join(directory, 'normalized.wav');
    const logs = [], errors = [];
    const log = mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
    const errorLog = mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
    const prepare = mock.method(chunks, 'prepareParakeetChunks', async () => [{ file: wav, start: 0, end: 1 }]);
    const spawn = mock.method(processes, 'spawn', (_binary, args) => {
      assert.ok(!args.includes('-q') && !args.includes('--quiet'));
      assert.ok(args.includes('--batch-jsonl'));
      const child = new EventEmitter();
      child.stdout = new PassThrough(); child.stderr = new PassThrough();
      queueMicrotask(() => {
        child.stderr.end('Native backend diagnostic\n');
        const json = JSON.stringify({ file: wav, text: 'Private answer.', token_segments: [{ text: 'Private answer.', t0_ms: 0, t1_ms: 1000 }] });
        child.stdout.write(json.slice(0, 20)); child.stdout.end(json.slice(20) + '\n');
        child.emit('close', exitCode);
      });
      return child;
    });
    try {
      const engine = new TranscribeEngine('/runtime', { installed: async () => true, path: () => '/model.gguf' }, async () => wav);
      engine.available = async () => true;
      const result = engine.transcribe('/answer.wav', { model: 'parakeet-tdt-0.6b-v3' });
      if (exitCode === 0) {
        assert.equal((await result).text, 'Private answer.');
        assert.ok(logs.some(line => /Completed in [\d.]+ s/.test(line)));
        assert.equal(errors.length, 0);
      } else {
        await assert.rejects(result, /exit 7.*Native backend diagnostic/);
        assert.ok(errors.some(line => line.includes('[Parakeet] Failed:')));
        assert.ok(!logs.some(line => line.includes('Completed')));
      }
      assert.ok(logs.some(line => line.includes('[Parakeet] Preparing audio:')));
      assert.ok(logs.some(line => line.includes('[Parakeet] Starting local engine:')));
      assert.ok(logs.some(line => line.includes('Native backend diagnostic')));
      assert.ok(!logs.join('\n').includes('Private answer.'));
      await assert.rejects(fs.access(directory), { code: 'ENOENT' });
    } finally {
      spawn.mock.restore(); prepare.mock.restore(); log.mock.restore(); errorLog.mock.restore();
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
});

test('catalog uses pinned HTTPS artifacts, hashes and controlled IDs; Turbo has its actual alignment preset', () => {
  assert.equal(new Set(SPEECH_MODELS.map(model => model.name)).size, SPEECH_MODELS.length);
  for (const model of SPEECH_MODELS) {
    assert.match(model.sha256, /^[a-f0-9]{64}$/);
    assert.match(model.revision, /^[a-f0-9]{40}$/);
    assert.ok(model.url.startsWith('https://') && model.url.includes(model.revision));
    assert.equal(new URL(model.repositoryUrl).hostname, 'huggingface.co');
    assert.equal(new URL(model.repositoryUrl).pathname.slice(1), model.repository);
    assert.ok(model.url.startsWith(model.repositoryUrl + '/resolve/'), 'Repository must identify the implemented conversion, not just the upstream model');
    assert.equal(path.basename(model.filename), model.filename);
  }
  assert.throws(() => speechModel('../../outside'), /Unknown/);
  assert.equal(alignmentPreset('large-v3-turbo-q5_0'), 'large.v3.turbo');
});

test('transducer timings preserve a long pause and all recognized text without invented uniform timestamps', () => {
  const result = parseTransducerTranscript(JSON.stringify({ type: 'batch_header', load_ms: 100 }) + '\n' + JSON.stringify({
    text: 'Start. Back again.', token_segments: [
      { t0_ms: 1000, t1_ms: 1500, text: 'Start.' },
      { t0_ms: 32000, t1_ms: 32500, text: ' Back' },
      { t0_ms: 32600, t1_ms: 33000, text: ' again.' },
    ],
  }));
  assert.equal(result.timingMethod, 'transducer-tokens');
  assert.deepEqual(result.segments, [{ start: 1, end: 1.5, text: 'Start.' }, { start: 32, end: 33, text: ' Back again.' }]);
});

test('bad/incomplete timings preserve full text; runtime errors never become successful transcripts', () => {
  for (const segments of [[], [{ t0_ms: -1, t1_ms: 0, text: 'Whole answer' }], [{ t0_ms: 0, t1_ms: 100, text: 'Whole' }]]) {
    const result = parseTransducerTranscript(JSON.stringify({ text: 'Whole answer', token_segments: segments }));
    assert.equal(result.text, 'Whole answer');
    assert.equal(result.segments, undefined);
    assert.ok(result.alignmentWarning);
  }
  assert.throws(() => parseTransducerTranscript('{"text":"partial","error":"output truncated"}'), /truncated/);
  assert.throws(() => parseTransducerTranscript('{}\n{}'), /result count/);
});

test('punctuation emitted during silence attaches to preceding words without extending their times', () => {
  const result = parseTransducerTranscript(JSON.stringify({ text: 'First, resumed.', token_segments: [
    { t0_ms: 100, t1_ms: 500, text: 'First' }, { t0_ms: 23000, t1_ms: 23500, text: ',' },
    { t0_ms: 33000, t1_ms: 33500, text: ' resumed' }, { t0_ms: 36000, t1_ms: 36500, text: '.' },
  ] }));
  assert.deepEqual(result.segments, [{ start: 0.1, end: 0.5, text: 'First,' }, { start: 33, end: 33.5, text: ' resumed.' }]);
});

function serve(body, statusCode = 200) {
  return mock.method(https, 'get', (_url, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => {};
    queueMicrotask(() => {
      const response = new PassThrough();
      response.statusCode = statusCode; response.headers = {};
      callback(response); response.end(body);
    });
    return request;
  });
}

test('downloads publish only verified artifacts and failed replacements preserve an existing model', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'speech-model-test-'));
  const body = Buffer.from('model');
  const model = { ...speechModel('tiny'), sizeBytes: body.length, sha256: createHash('sha256').update(body).digest('hex') };
  const store = new ModelStore(directory);
  let response = serve(body);
  try {
    await fs.writeFile(store.path('tiny'), 'Entry not found');
    await store.fetch(model);
    assert.equal(await fs.readFile(store.path('tiny'), 'utf8'), 'model');
    response.mock.restore(); response = serve(Buffer.from('wrong'));
    await assert.rejects(store.fetch(model), /checksum/);
    assert.equal(await fs.readFile(store.path('tiny'), 'utf8'), 'model');
    response.mock.restore(); response = serve('missing', 404);
    await assert.rejects(store.fetch(model), /HTTP 404/);
    assert.deepEqual(await fs.readdir(directory), ['ggml-tiny.bin']);
    assert.equal((await store.list()).find(model => model.name === 'tiny').installed, false);
  } finally { response.mock.restore(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('catalog discovery reads metadata only, excludes incomplete files and remembers verified corruption', async () => {
  const model = speechModel('tiny');
  const store = new ModelStore('/metadata-only');
  let size = BigInt(model.sizeBytes);
  let changed = 0n;
  let isFile = true;
  const stat = mock.method(fs, 'stat', async file => {
    if (file !== store.path(model.name)) throw new Error('Missing');
    return { isFile: () => isFile, size, dev: 1n, ino: 2n, mtimeNs: changed, ctimeNs: changed };
  });
  const reads = mock.method(require('node:fs'), 'createReadStream', () => {
    const stream = new PassThrough(); stream.end('corrupt'); return stream;
  });
  const listed = async () => (await store.list()).find(entry => entry.name === model.name).installed;
  try {
    assert.equal(await listed(), true);
    assert.equal(await listed(), true);
    assert.equal(reads.mock.callCount(), 0, 'Opening either page must not read model contents');
    assert.equal(await store.installed(model), false, 'Engine integrity check still rejects corrupt weights');
    assert.equal(reads.mock.callCount(), 1);
    assert.equal(await listed(), false, 'Known corrupt file is excluded on the next refresh');
    changed++;
    assert.equal(await listed(), true, 'Replaced file is discoverable for a new integrity check');
    size--;
    assert.equal(await listed(), false);
    size++; isFile = false;
    assert.equal(await listed(), false);
    assert.equal(reads.mock.callCount(), 1);
  } finally { stat.mock.restore(); reads.mock.restore(); }
});

test('model deletion accepts catalog IDs only, preserves other files and excludes active downloads', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'speech-delete-test-'));
  const store = new ModelStore(directory);
  try {
    await fs.writeFile(store.path('tiny'), 'tiny weights');
    await fs.writeFile(store.path('base'), 'base weights');
    await fs.writeFile(path.join(directory, 'history.json'), 'keep history');
    await assert.rejects(store.delete('../base'), /Unknown speech model/);
    await store.delete('tiny');
    await assert.rejects(fs.access(store.path('tiny')), /ENOENT/);
    assert.equal(await fs.readFile(store.path('base'), 'utf8'), 'base weights');
    assert.equal(await fs.readFile(path.join(directory, 'history.json'), 'utf8'), 'keep history');
    await store.delete('tiny'); // Already absent is a successful delete.
    let finish;
    store.fetch = () => new Promise(resolve => { finish = resolve; });
    const download = store.download('tiny');
    await assert.rejects(store.delete('tiny'), /download to finish/);
    finish(); await download;
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('installed verification rejects same-size corruption and invalidates cached results after replacement', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'speech-integrity-test-'));
  const body = Buffer.from('valid');
  const model = { ...speechModel('tiny'), sizeBytes: body.length, sha256: createHash('sha256').update(body).digest('hex') };
  const store = new ModelStore(directory);
  const target = store.path(model.name);
  try {
    await fs.writeFile(target, 'wrong');
    assert.equal(await store.installed(model), false);
    await fs.writeFile(target + '.replacement', body);
    await fs.rename(target + '.replacement', target);
    assert.equal(await store.installed(model), true);
    assert.equal(await store.installed(model), true);
    await fs.writeFile(target + '.replacement', 'wrong');
    await fs.rename(target + '.replacement', target);
    assert.equal(await store.installed(model), false);
    await fs.writeFile(target, 'Entry not found');
    assert.equal(await store.installed(model), false);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('catalog refresh preserves independent concurrent downloads and duplicate requests share work', async () => {
  const store = new ModelStore('/unused');
  const releases = new Map();
  store.fetch = async model => new Promise((resolve, reject) => releases.set(model.name, { resolve, reject }));
  const medium = store.download('medium');
  const large = store.download('large');
  assert.equal(store.download('medium'), medium);
  let list = await store.list();
  assert.equal(list.find(model => model.name === 'medium').downloading, true);
  assert.equal(list.find(model => model.name === 'large').downloading, true);
  releases.get('large').reject(new Error('HTTP 404'));
  await assert.rejects(large, /404/);
  list = await store.list();
  assert.equal(list.find(model => model.name === 'large').downloading, false);
  assert.equal(list.find(model => model.name === 'medium').downloading, true);
  releases.get('medium').resolve(); await medium;
  assert.equal((await store.list()).some(model => model.downloading), false);
});
