// Initial Linux target: x86_64 CPU, statically linked ggml/Whisper.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ensureWhisperSource } = require('./native-source.cjs');
if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Linux build requires Linux x86_64.');
const root = path.resolve(__dirname, '..');
ensureWhisperSource(root);
const source = path.join(root, 'whisper.cpp');
const build = path.join(source, 'build-baseline');
execFileSync('cmake', ['-S', source, '-B', build, '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DGGML_NATIVE=OFF', '-DGGML_OPENMP=OFF', '-DGGML_VULKAN=OFF', '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_BUILD_EXAMPLES=ON'], { stdio: 'inherit' });
execFileSync('cmake', ['--build', build, '--target', 'whisper-cli', 'whisper-vad-speech-segments', '--parallel', '4'], { stdio: 'inherit' });
const notices = path.join(build, 'bin', 'licenses');
fs.mkdirSync(notices, { recursive: true });
// The pinned Whisper tree uses its root ggml-authors MIT notice for ggml too.
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(notices, 'LICENSE-whisper.cpp'));
