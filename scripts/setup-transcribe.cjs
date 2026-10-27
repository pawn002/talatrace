// Build the pinned native CLI; no Python or model download is required.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'transcribe.cpp');
const commit = '4d7c1ccefd39e5a9ea36cca5f8fefc6dcc14b99b'; // v0.4.1
function run(command, args, options = {}) { return execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options }); }
if (!fs.existsSync(source)) run('git', ['clone', '--depth', '1', '--branch', 'v0.4.1', 'https://github.com/handy-computer/transcribe.cpp.git', source]);
const actual = run('git', ['-C', source, 'rev-parse', 'HEAD'], { stdio: 'pipe', encoding: 'utf8' }).trim();
if (actual !== commit) throw new Error('Unexpected transcribe.cpp revision. Use the pinned v0.4.1 source checkout.');
const patch = path.join(__dirname, 'patches', 'transcribe-token-json.patch');
const status = run('git', ['-C', source, 'status', '--porcelain'], { stdio: 'pipe', encoding: 'utf8' }).trim();
if (!status) run('git', ['-C', source, 'apply', patch]);
const diff = run('git', ['-C', source, 'diff', '--binary'], { stdio: 'pipe', encoding: 'utf8' }).replace(/\r\n/g, '\n').trim();
if (diff !== fs.readFileSync(patch, 'utf8').replace(/\r\n/g, '\n').trim()) throw new Error('Runtime source differs from the pinned token-JSON adapter patch.');
const build = path.join(source, process.argv.includes('--cpu') ? 'build-cpu' : 'build-vulkan');
const args = ['-S', source, '-B', build, '-DTRANSCRIBE_BUILD_TESTS=OFF', '-DGGML_NATIVE=OFF'];
if (process.platform === 'win32') args.push('-G', 'Visual Studio 17 2022', '-A', 'x64');
if (process.platform === 'win32' || process.platform === 'linux') args.push(`-DTRANSCRIBE_VULKAN=${process.argv.includes('--cpu') ? 'OFF' : 'ON'}`);
run('cmake', args);
run('cmake', ['--build', build, '--config', 'Release', '--target', 'transcribe-cli', '--parallel', '4']);
const destination = path.join(root, 'transcribe-runtime');
fs.mkdirSync(destination, { recursive: true });
const binary = process.platform === 'win32' ? 'transcribe-cli.exe' : 'transcribe-cli';
const candidates = [path.join(build, 'bin', 'Release', binary), path.join(build, 'bin', binary), path.join(build, 'examples', 'cli', 'Release', binary), path.join(build, 'examples', 'cli', binary)];
const found = candidates.find(candidate => fs.existsSync(candidate));
if (!found) throw new Error('Built runtime CLI was not found.');
fs.copyFileSync(found, path.join(destination, binary));
// This build statically links ggml/transcribe. Retain upstream license notices.
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(destination, 'LICENSE-transcribe.cpp'));
fs.copyFileSync(path.join(source, 'ggml', 'LICENSE'), path.join(destination, 'LICENSE-ggml'));
function copyNotices(directory, relative = '') {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) copyNotices(file, next);
    else if (/^(license|copying)/i.test(entry.name)) {
      const target = path.join(destination, 'licenses', next);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file, target);
    }
  }
}
copyNotices(path.join(source, 'src', 'third_party'));
fs.writeFileSync(path.join(destination, 'version.json'), JSON.stringify({ version: '0.4.1', commit, adapter: 'token-json-v1', vulkan: !process.argv.includes('--cpu') && process.platform !== 'darwin' }, null, 2));
console.log(`Native transcription runtime ready: ${destination}`);
