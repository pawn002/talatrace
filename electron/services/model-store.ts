import * as fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import * as https from 'https';
import * as path from 'path';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import { SPEECH_MODELS, speechModel, modelSize, SpeechModel } from './model-catalog';

export class ModelStore {
  private downloads = new Map<string, Promise<void>>();
  constructor(readonly directory: string) {}
  path(name: string): string { return path.join(this.directory, speechModel(name).filename); }

  async installed(model: SpeechModel): Promise<boolean> {
    try { return (await fs.stat(this.path(model.name))).size === model.sizeBytes; } catch { return false; }
  }

  async list() {
    return Promise.all(SPEECH_MODELS.map(async model => ({ ...model, size: modelSize(model.sizeBytes),
      installed: await this.installed(model), path: this.path(model.name) })));
  }

  download(name: string, progress?: (progress: number) => void): Promise<void> {
    const model = speechModel(name);
    const pending = this.downloads.get(name);
    if (pending) return pending;
    const task = this.fetch(model, progress).finally(() => this.downloads.delete(name));
    this.downloads.set(name, task);
    return task;
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
