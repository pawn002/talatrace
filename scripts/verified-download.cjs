const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');

async function verifyFile(file, artifact) {
  try {
    if ((await fsp.stat(file)).size !== artifact.sizeBytes) return false;
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex') === artifact.sha256;
  } catch { return false; }
}

function response(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8 || new URL(url).protocol !== 'https:') return reject(new Error('Expected an HTTPS download/redirect'));
    const request = https.get(url, result => {
      if ([301, 302, 303, 307, 308].includes(result.statusCode) && result.headers.location) {
        result.resume();
        try { response(new URL(result.headers.location, url).href, redirects + 1).then(resolve, reject); }
        catch (error) { reject(error); }
      } else if (result.statusCode !== 200) { result.resume(); reject(new Error(`Download failed (HTTP ${result.statusCode})`)); }
      else resolve(result);
    });
    request.setTimeout(60000, () => request.destroy(new Error('Download timed out')));
    request.on('error', reject);
  });
}

async function verifiedDownload(artifact, target) {
  if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0 || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error('Invalid artifact size/hash');
  if (await verifyFile(target, artifact)) return target;
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const stage = await fsp.mkdtemp(path.join(path.dirname(target), '.download-'));
  const candidate = path.join(stage, 'artifact');
  try {
    const stream = await response(artifact.url);
    let bytes = 0;
    stream.on('data', chunk => { bytes += chunk.length; if (bytes > artifact.sizeBytes) stream.destroy(new Error('Download exceeded expected size')); });
    await pipeline(stream, fs.createWriteStream(candidate, { flags: 'wx' }));
    if (!await verifyFile(candidate, artifact)) throw new Error('Download failed size/SHA-256 verification');
    await fsp.rename(candidate, target);
    return target;
  } finally {
    // stage is owned by this call and always stays inside the requested parent.
    const parent = path.resolve(path.dirname(target)) + path.sep;
    if (!path.resolve(stage).startsWith(parent)) throw new Error('Invalid download workspace');
    await fsp.rm(stage, { recursive: true, force: true });
  }
}
module.exports = { verifiedDownload, verifyFile };
