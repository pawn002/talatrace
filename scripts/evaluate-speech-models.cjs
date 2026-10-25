// Run with Electron after build:electron. No window, microphone or user history is opened.
const { app, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { score, summarize } = require('./speech-eval-metrics.cjs');
const root = path.resolve(__dirname, '..');
const corpus = path.resolve(process.argv[2] || path.join(root, 'benchmarks/cache/librispeech-12/manifest.json'));
const output = path.resolve(process.argv[3] || path.join(root, 'benchmarks/results', new Date().toISOString().replace(/[:.]/g, '-')));
const originalUserData = app.getPath('userData');
const ownedModelLinks = [];
function removeModelLinks() {
  for (const file of ownedModelLinks) fs.unlinkSync(file);
  ownedModelLinks.length = 0;
}
fs.mkdirSync(output, { recursive: true });
const profile = path.join(output, 'profile');
fs.mkdirSync(path.join(profile, 'models'), { recursive: true });
app.setAppPath(root);
app.setPath('userData', profile);
fs.writeFileSync(path.join(profile, '.models-migrated'), 'Isolated evaluation: linked verified existing weights only.');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function hash(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
const log = console.log.bind(console);
let diagnostic;
console.log = (...args) => { if (diagnostic) fs.appendFileSync(diagnostic, args.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n'); };

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }));
  // No model download is permitted in this runner, including Node HTTPS initialization paths.
  require('node:https').get = () => { throw new Error('Network disabled during evaluation'); };
  const { SPEECH_MODELS } = require('../dist/electron/services/model-catalog');
  const { TranscriptionService } = require('../dist/electron/services/transcription.service');
  const only = process.env.SPEECH_EVAL_ONLY?.split(',');
  if (only?.some(name => !SPEECH_MODELS.some(model => model.name === name))) throw new Error('Unknown SPEECH_EVAL_ONLY model');
  const repeats = Number(process.env.SPEECH_EVAL_REPEATS ?? 3);
  if (!Number.isInteger(repeats) || repeats < 0 || repeats > 10) throw new Error('SPEECH_EVAL_REPEATS must be 0–10');
  const manifest = JSON.parse(fs.readFileSync(corpus));
  for (const item of manifest.items) {
    const file = path.resolve(path.dirname(corpus), item.file);
    if (path.dirname(file) !== path.dirname(corpus) || await hash(file) !== item.sha256) throw new Error('Fixture integrity failed: ' + item.id);
  }
  const report = {
    createdAt: new Date().toISOString(), corpus: manifest, corpusManifestSHA256: await hash(corpus),
    system: { platform: process.platform, release: os.release(), arch: os.arch(), cpu: os.cpus()[0].model,
      logicalCPUs: os.cpus().length, memoryBytes: os.totalmem(), electron: process.versions.electron,
      gpu: await app.getGPUInfo('basic') },
    options: { language: 'auto', threads: 4, alignTimestamps: true, detectQuietIntervals: true,
      path: 'TranscriptionService.processAudio; recording metadata enabled', modelProcess: 'new CLI process per job; OS/shader caches uncontrolled' },
    scoring: 'v1 NFKC/lowercase/remove apostrophes and punctuation/collapse whitespace; no number expansion; corpus (S+D+I)/reference words; silence reports inserted words, not WER',
    models: [], runs: [], summaries: [],
    runtime: { transcribe: JSON.parse(fs.readFileSync(path.join(root, 'transcribe-runtime/version.json'))),
      transcribeBinarySHA256: await hash(path.join(root, 'transcribe-runtime/transcribe-cli.exe')),
      whisperBinarySHA256: await hash(path.join(root, 'whisper.cpp/build-vulkan/bin/whisper-cli.exe')),
      whisperCommit: execFileSync('git', ['-C', path.join(root, 'whisper.cpp'), 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
      serviceSHA256: Object.fromEntries(await Promise.all(['transcription.service', 'speech.service', 'whisper.service', 'transcribe-engine', 'speech-alignment', 'transducer-transcript'].map(async name => [name, await hash(path.join(root, 'dist/electron/services', name + '.js'))]))) },
  };
  for (const model of SPEECH_MODELS) {
    if (only && !only.includes(model.name)) { report.models.push({ ...model, evaluationStatus: 'skipped: excluded by evaluation filter' }); continue; }
    const candidates = [...new Set([process.env.SPEECH_EVAL_MODELS, path.join(originalUserData, 'models'), path.join(os.homedir(), 'AppData/Roaming/whisper-electron-app/models'), path.join(root, 'models')].filter(Boolean))];
    const source = candidates.map(dir => path.join(dir, model.filename)).find(file => fs.existsSync(file) && fs.statSync(file).size === model.sizeBytes);
    if (!source) { report.models.push({ ...model, evaluationStatus: 'skipped: no complete installed artifact' }); continue; }
    if (await hash(source) !== model.sha256) throw new Error('Model checksum mismatch: ' + model.name);
    // Expose existing weights under an isolated profile; the runner never modifies their contents.
    const link = path.join(profile, 'models', model.filename);
    fs.linkSync(source, link);
    ownedModelLinks.push(link);
    report.models.push({ ...model, evaluationStatus: 'ready', verifiedSHA256: model.sha256 });
  }
  const service = new TranscriptionService(null);
  function save() {
    report.summaries = report.models.filter(m => m.evaluationStatus === 'ready').map(model => ({
      model: model.name, groups: [...new Set(report.runs.map(row => row.condition))].map(condition => ({
        condition, ...summarize(report.runs.filter(row => row.model === model.name && row.condition === condition && !row.error)),
        failures: report.runs.filter(row => row.model === model.name && row.condition === condition && row.error).length,
      })),
    }));
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  }
  save();
  for (const model of report.models.filter(m => m.evaluationStatus === 'ready')) {
    const jobs = [...manifest.items, ...Array.from({ length: repeats }, (_, i) => ({ ...manifest.items[0], condition: 'repeat-speed', id: manifest.items[0].id + '-repeat-' + (i + 1) }))];
    for (const item of jobs) {
      diagnostic = path.join(output, model.name + '-' + item.id + '.log');
      const started = Date.now();
      log(`${model.name} | ${item.condition} | ${item.id}`);
      const job = await service.processAudio(path.resolve(path.dirname(corpus), item.file), {
        model: model.name, threads: 4, timestamps: true, alignTimestamps: true, detectQuietIntervals: true,
      });
      while (job.status === 'pending' || job.status === 'processing') {
        if (Date.now() - started > 10 * 60 * 1000) throw new Error('Job exceeded ten-minute evaluation limit: ' + item.id);
        await sleep(50);
      }
      const row = { model: model.name, id: item.id, condition: item.condition, reference: item.reference,
        duration: job.audioDuration ?? item.duration, processingMs: job.transcriptionTime, wallMs: Date.now() - started,
        error: job.error, text: job.result?.text, segments: job.result?.segments,
        noSpeechIntervals: job.result?.noSpeechIntervals, timingMethod: job.result?.timingMethod,
        alignmentWarning: job.result?.alignmentWarning, speechDetectionWarning: job.result?.speechDetectionWarning };
      if (!row.error) row.score = score(item.reference, row.text);
      report.runs.push(row); save();
      log(`  ${row.error || `${(row.processingMs / 1000).toFixed(2)}s processing; ${row.score.distance}/${row.score.referenceWords} word errors`}`);
    }
  }
  report.completedAt = new Date().toISOString(); save();
  const lines = ['# Local speech evaluation', '', `Generated ${report.completedAt}`, '',
    '| Model | Condition | Clips | WER | Insertions | Processing (s) | Audio / processing | Failures |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const model of report.summaries) for (const group of model.groups) if (group.count || group.failures) lines.push(
    `| ${model.model} | ${group.condition} | ${group.count} | ${group.wer == null ? 'n/a' : (100 * group.wer).toFixed(2) + '%'} | ${group.insertions} | ${(group.processingMs / 1000).toFixed(2)} | ${group.audioPerProcessing?.toFixed(2) || 'n/a'}x | ${group.failures} |`);
  lines.push('', 'Reference audio/text: LibriSpeech test-clean, CC BY 4.0, https://www.openslr.org/12/.',
    'Small deterministic subset, not the full test set or a spontaneous-interview evaluation. Noise and pause variants reuse three source utterances; they are not independent samples.',
    'Speed includes decoding, model loading, speech detection, alignment and app overhead. Every job starts a new native CLI process; caches are not flushed.',
    'Speech-free insertion counts include emitted non-speech markers such as [BLANK_AUDIO]; inspect raw text to distinguish annotations from invented speech.',
    'Published WERs may use different normalization. See results.json for transcripts, S/D/I counts, provenance, hashes, hardware, options, warnings and skipped models.');
  fs.writeFileSync(path.join(output, 'summary.md'), lines.join('\n') + '\n');
  log('Evaluation complete: ' + output);
  removeModelLinks();
  app.exit(report.runs.some(row => row.error) ? 1 : 0);
}).catch(error => { console.error(error); removeModelLinks(); app.exit(1); });
