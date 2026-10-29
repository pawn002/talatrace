const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ensureWhisperSource } = require('./native-source.cjs');
const { verifiedDownload } = require('./verified-download.cjs');
const { vad } = require('./native-artifacts.cjs');
const { setupFfmpeg } = require('./setup-ffmpeg');

async function setupWhisper({ root = path.resolve(__dirname, '..'), skipBuild = false } = {}) {
  if (!['win32', 'linux'].includes(process.platform) || process.arch !== 'x64') throw new Error('Setup currently targets Windows/Linux x64.');
  ensureWhisperSource(root);
  const run = args => execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (!skipBuild) run(process.platform === 'linux' ? [path.join(root, 'scripts/build-whisper-linux.cjs')] : [path.join(root, 'scripts/build-whisper-variants.js'), '--variant=baseline']);
  // Compile the catalog/store rather than duplicating model URLs, sizes or hashes.
  run([path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(root, 'electron')]);
  const { ModelStore } = require(path.join(root, 'dist/electron/services/model-store'));
  const { speechModel } = require(path.join(root, 'dist/electron/services/model-catalog'));
  const store = new ModelStore(path.join(root, 'models'));
  for (const name of ['tiny', 'base']) {
    if (!await store.installed(speechModel(name))) await store.download(name);
    console.log('Verified model:', name);
  }
  await verifiedDownload(vad, path.join(root, 'models', vad.filename));
  await setupFfmpeg({ root });
  if (!skipBuild) run([path.join(root, 'scripts/setup-transcribe.cjs'), '--cpu']);
  const windows = process.platform === 'win32';
  const bin = 'whisper.cpp/build-baseline/bin/' + (windows ? 'Release/' : '');
  for (const file of [bin + (windows ? 'whisper-cli.exe' : 'whisper-cli'), bin + (windows ? 'whisper-vad-speech-segments.exe' : 'whisper-vad-speech-segments'), 'ffmpeg/bin/' + (windows ? 'ffmpeg.exe' : 'ffmpeg'), 'transcribe-runtime/' + (windows ? 'transcribe-cli.exe' : 'transcribe-cli')]) {
    if (!fs.existsSync(path.join(root, file))) throw new Error('Setup incomplete; missing ' + file);
  }
  console.log('Verified runtimes and setup models ready. Model downloads in the app remain explicit.');
}
module.exports = { setupWhisper };
if (require.main === module) setupWhisper({ skipBuild: process.argv.includes('--skip-build') }).catch(error => { console.error(error.message); process.exitCode = 1; });
