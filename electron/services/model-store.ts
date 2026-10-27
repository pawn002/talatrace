import * as fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import * as https from 'https';
import * as path from 'path';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import { SPEECH_MODELS, speechModel, modelSize, SpeechModel } from './model-catalog';

export class ModelStore {
  private downloads = new Map<string, Promise<void>>();
  private deleting = new Set<string>();
  private verification = new Map<string, { stamp: string; valid: boolean }>();
  constructor(readonly directory: string) {}
  path(name: string): string { return path.join(this.directory, speechModel(name).filename); }

  private stamp(model: SpeechModel, stat: import('fs').BigIntStats): string {
    return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${model.sha256}`;
  }

  /** Discover complete files without reading gigabytes on startup or every UI poll.
   * Download publication and engine use still require full checksum verification.
   */
  private async present(model: SpeechModel): Promise<boolean> {
    try {
      const stat = await fs.stat(this.path(model.name), { bigint: true });
      if (!stat.isFile() || stat.size !== BigInt(model.sizeBytes)) return false;
      const cached = this.verification.get(model.name);
      return cached?.stamp === this.stamp(model, stat) ? cached.valid : true;
    } catch { return false; }
  }

  async installed(model: SpeechModel): Promise<boolean> {
    try {
      const file = this.path(model.name);
      const before = await fs.stat(file, { bigint: true });
      if (!before.isFile() || before.size !== BigInt(model.sizeBytes)) return false;
      const stamp = this.stamp(model, before);
      const cached = this.verification.get(model.name);
      if (cached?.stamp === stamp) return cached.valid;
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      const after = await fs.stat(file, { bigint: true });
      // Do not cache a result if the file was replaced or changed while reading it.
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
          before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) return false;
      const valid = hash.digest('hex') === model.sha256;
      this.verification.set(model.name, { stamp, valid });
      return valid;
    } catch { return false; }
  }

  async list() {
    return Promise.all(SPEECH_MODELS.map(async model => ({ ...model, size: modelSize(model.sizeBytes),
      installed: await this.present(model), downloading: this.downloads.has(model.name), path: this.path(model.name) })));
  }

  download(name: string, progress?: (progress: number) => void): Promise<void> {
    const model = speechModel(name);
    if (this.deleting.has(name)) return Promise.reject(new Error('Wait for model deletion to finish before downloading it.'));
    const pending = this.downloads.get(name);
    if (pending) return pending;
    const task = this.fetch(model, progress).finally(() => this.downloads.delete(name));
    this.downloads.set(name, task);
    return task;
  }

  async delete(name: string): Promise<void> {
    const target = this.path(name); // Catalog IDs only; renderer paths are never accepted.
    if (this.downloads.has(name)) throw new Error('Wait for this model download to finish before deleting it.');
    if (this.deleting.has(name)) throw new Error('Model deletion is already in progress.');
    this.deleting.add(name);
    try {
      await fs.unlink(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
      this.verification.delete(name);
    } finally { this.deleting.delete(name); }
  }

  private async fetch(model: SpeechModel, progress?: (progress: number) => void): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    const staging = await fs.mkdtemp(path.join(this.directory, '.download-'));
    const target = path.join(staging, model.filename);
    try {
      const response = await this.response(model.url);
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > model.sizeBytes) response.destroy(new Error('Model download exceeded its expected size'));
        progress?.(Math.min(99, bytes / model.sizeBytes * 100));
      });
      await pipeline(response, createWriteStream(target, { flags: 'wx' }));
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(target)) hash.update(chunk);
      if (bytes !== model.sizeBytes || hash.digest('hex') !== model.sha256) throw new Error('Model download failed size or checksum verification. Please retry.');
      // Keep any existing complete model until its replacement is verified.
      await fs.rename(target, this.path(model.name));
      progress?.(100);
    } finally { await fs.rm(staging, { recursive: true, force: true }); }
  }

  private response(url: string, redirects = 0): Promise<import('http').IncomingMessage> {
    return new Promise((resolve, reject) => {
      if (redirects > 8 || new URL(url).protocol !== 'https:') return reject(new Error('Invalid model download redirect'));
      const request = https.get(url, response => {
        if ([301,302,303,307,308].includes(response.statusCode || 0) && response.headers.location) {
          response.resume();
          this.response(new URL(response.headers.location, url).href, redirects + 1).then(resolve, reject);
        } else if (response.statusCode !== 200) {
          response.resume(); reject(new Error(`Model download failed (HTTP ${response.statusCode})`));
        } else resolve(response);
      });
      request.setTimeout(60000, () => request.destroy(new Error('Model download timed out')));
      request.on('error', reject);
    });
  }
}
