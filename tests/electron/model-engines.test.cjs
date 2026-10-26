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
