const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { verifiedDownload } = require('./verified-download.cjs');
const { ffmpegWindows, ffmpegLinux } = require('./native-artifacts.cjs');

async function setupFfmpeg({ root = path.resolve(__dirname, '..'), platform = process.platform, arch = process.arch, download = verifiedDownload, execute = execFileSync } = {}) {
  if (!['win32', 'linux'].includes(platform) || arch !== 'x64') throw new Error('Verified FFmpeg setup targets Windows/Linux x64.');
  const artifact = platform === 'win32' ? ffmpegWindows : ffmpegLinux;
  const binaryName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const cache = path.join(root, '.native-cache', artifact.filename);
  await download(artifact, cache);
  const parent = path.join(root, 'ffmpeg');
  await fsp.mkdir(parent, { recursive: true });
  const stage = await fsp.mkdtemp(path.join(parent, '.staging-'));
  try {
    if (platform === 'win32') execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:TALATRACE_ARCHIVE -DestinationPath $env:TALATRACE_EXTRACT -Force'], {
      env: { ...process.env, TALATRACE_ARCHIVE: cache, TALATRACE_EXTRACT: stage }, stdio: 'inherit', windowsHide: true,
    });
    else execute('tar', ['-xJf', cache, '-C', stage, '--no-same-owner'], { stdio: 'inherit' });
    const files = [];
    async function scan(directory) {
      for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in FFmpeg archive');
        if (entry.isDirectory()) await scan(file); else files.push(file);
      }
    }
    await scan(stage);
    const binaries = files.filter(file => path.basename(file) === binaryName);
    if (binaries.length !== 1) throw new Error('Expected one FFmpeg executable in verified archive');
    const binary = binaries[0];
    if (platform === 'linux') await fsp.chmod(binary, 0o755);
    const version = execute(binary, ['-version'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/)[0];
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(binary)) hash.update(chunk);
    const notices = files.filter(file => /^(?:license|copying|readme)(?:[._-]|$)/i.test(path.basename(file)));
    if (!notices.length) throw new Error('FFmpeg license/readme notices missing');
    for (const notice of notices) {
      const target = path.join(parent, 'licenses', path.relative(stage, notice));
      await fsp.mkdir(path.dirname(target), { recursive: true }); await fsp.copyFile(notice, target);
    }
    await fsp.mkdir(path.join(parent, 'bin'), { recursive: true });
    await fsp.rename(binary, path.join(parent, 'bin', binaryName));
    await fsp.writeFile(path.join(parent, 'version.json'), JSON.stringify({ ...artifact, binarySha256: hash.digest('hex'), version, platform, arch }, null, 2) + '\n');
    console.log('Verified FFmpeg ready:', version);
    return path.join(parent, 'bin', binaryName);
  } finally {
    if (!path.resolve(stage).startsWith(path.resolve(parent) + path.sep)) throw new Error('Invalid FFmpeg staging path');
    await fsp.rm(stage, { recursive: true, force: true });
  }
}
module.exports = { setupFfmpeg };
if (require.main === module) setupFfmpeg().catch(error => { console.error(error.message); process.exitCode = 1; });
