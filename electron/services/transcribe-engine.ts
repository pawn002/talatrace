import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RecognitionEngine } from './recognition-engine';
import { TranscriptionOptions, TranscriptionResult } from './types';
import { speechModel } from './model-catalog';
import { ModelStore } from './model-store';
import { parseTransducerTranscript } from './transducer-transcript';

export class TranscribeEngine implements RecognitionEngine {
  readonly binary: string;
  constructor(basePath: string, private models: ModelStore,
    private convert: (input: string) => Promise<string>) {
    this.binary = path.join(basePath, 'transcribe-runtime', process.platform === 'win32' ? 'transcribe-cli.exe' : 'transcribe-cli');
  }

  async available(): Promise<boolean> {
    try {
      await fs.access(this.binary);
      const version = JSON.parse(await fs.readFile(path.join(path.dirname(this.binary), 'version.json'), 'utf8'));
      return version.version === '0.4.1' && version.adapter === 'token-json-v1';
    } catch { return false; }
  }

  async transcribe(audioPath: string, options: TranscriptionOptions, progress?: (progress: number) => void): Promise<TranscriptionResult> {
    const model = speechModel(options.model);
    if (model.engine !== 'transcribe.cpp') throw new Error('Unsupported alternate speech model');
    if (options.translate) throw new Error('Parakeet transcribes speech; it does not translate. Choose a Whisper model for translation.');
    if (options.language && options.language !== 'auto' && !model.languages?.includes(options.language)) throw new Error('This language is not supported by Parakeet. Choose a Whisper model.');
    if (!await this.available()) throw new Error('Parakeet runtime is unavailable. Run npm run setup:transcribe and rebuild the app.');
    if (!await this.models.installed(model)) throw new Error('Download the complete Parakeet model first.');
    // Always normalize: a .wav extension does not establish mono/16 kHz/PCM.
    const wav = await this.convert(audioPath);
    const workspace = path.dirname(wav);
    try {
      const batch = path.join(workspace, 'input.txt');
      await fs.writeFile(batch, wav + '\n');
      const output = await new Promise<string>((resolve, reject) => {
        const args = ['-m', this.models.path(model.name), '--batch', batch, '--batch-jsonl', '--timestamps', 'token', '--threads', String(options.threads || 4), '--backend', 'auto', '-q'];
        if (options.language && options.language !== 'auto') args.push('-l', options.language);
        const child = spawn(this.binary, args, { windowsHide: true, cwd: path.dirname(this.binary) });
        let stdout = ''; let diagnostic = '';
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-3000); });
        child.on('error', () => reject(new Error('Could not start the local Parakeet engine. Check the runtime installation.')));
        child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`Parakeet transcription failed (exit ${code}). ${diagnostic}`)));
      });
      progress?.(100);
      return { ...parseTransducerTranscript(output), engine: model.engine, model: model.name };
    } finally { await fs.rm(workspace, { recursive: true, force: true }); }
  }
}
