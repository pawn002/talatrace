const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ensureWhisperSource } = require('./native-source.cjs');
const { verifiedDownload } = require('./verified-download.cjs');
const { vad } = require('./native-artifacts.cjs');
const { setupFfmpeg } = require('./setup-ffmpeg');

async function setupWhisper({ root = path.resolve(__dirname, '..'), skipBuild = false } = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The verified setup currently targets Windows x64. Linux support is tracked in #24.');
  ensureWhisperSource(root);
  const run = args => execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (!skipBuild) run([path.join(root, 'scripts/build-whisper-variants.js'), '--variant=baseline']);
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
  for (const file of ['whisper.cpp/build-baseline/bin/Release/whisper-cli.exe', 'whisper.cpp/build-baseline/bin/Release/whisper-vad-speech-segments.exe', 'ffmpeg/bin/ffmpeg.exe', 'transcribe-runtime/transcribe-cli.exe']) {
    if (!fs.existsSync(path.join(root, file))) throw new Error('Setup incomplete; missing ' + file);
  }
  console.log('Verified Windows runtimes and setup models ready. Model downloads in the app remain explicit.');
}
module.exports = { setupWhisper };
if (require.main === module) setupWhisper({ skipBuild: process.argv.includes('--skip-build') }).catch(error => { console.error(error.message); process.exitCode = 1; });
