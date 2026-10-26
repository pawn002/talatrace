import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { RecognitionEngine, RecognitionContext } from './recognition-engine';
import { TranscriptionOptions, TranscriptionResult } from './types';
import { speechModel } from './model-catalog';
import { ModelStore } from './model-store';
import { prepareParakeetChunks, parseParakeetChunks } from './parakeet-chunks';

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

  async transcribe(audioPath: string, options: TranscriptionOptions, progress?: (progress: number) => void, context?: RecognitionContext): Promise<TranscriptionResult> {
    const model = speechModel(options.model);
    if (model.engine !== 'transcribe.cpp') throw new Error('Unsupported alternate speech model');
    if (options.translate) throw new Error('Parakeet transcribes speech; it does not translate. Choose a Whisper model for translation.');
    if (options.language && options.language !== 'auto' && !model.languages?.includes(options.language)) throw new Error('This language is not supported by Parakeet. Choose a Whisper model.');
    if (!await this.available()) throw new Error('Parakeet runtime is unavailable. Run npm run setup:transcribe and rebuild the app.');
    if (!await this.models.installed(model)) throw new Error('Parakeet model is missing, incomplete or corrupt. Download it again from Models before transcribing.');
    const started = performance.now();
    console.log(`[Parakeet] Preparing audio: model=${model.name}, language=${options.language || 'auto'}, threads=${options.threads || 4}`);
    // Always normalize: a .wav extension does not establish mono/16 kHz/PCM.
    const wav = await this.convert(audioPath);
    const workspace = path.dirname(wav);
    try {
      const chunks = await prepareParakeetChunks(wav, context?.noSpeechIntervals || []);
      const batch = path.join(workspace, 'input.txt');
      await fs.writeFile(batch, chunks.map(chunk => chunk.file).join('\n') + '\n');
      console.log(`[Parakeet] Starting local engine: ${chunks.length} audio chunk(s), backend=auto`);
      const output = await new Promise<string>((resolve, reject) => {
        const args = ['-m', this.models.path(model.name), '--batch', batch, '--batch-jsonl', '--timestamps', 'token', '--threads', String(options.threads || 4), '--backend', 'auto'];
        if (options.language && options.language !== 'auto') args.push('-l', options.language);
        const child = spawn(this.binary, args, { windowsHide: true, cwd: path.dirname(this.binary) });
        let stdout = ''; let diagnostic = '';
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => {
          diagnostic = (diagnostic + chunk).slice(-3000);
          console.log('[Parakeet] Engine:', chunk.trimEnd());
        });
        child.on('error', () => reject(new Error('Could not start the local Parakeet engine. Check the runtime installation.')));
        child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`Parakeet transcription failed (exit ${code}). ${diagnostic}`)));
      });
      const result = parseParakeetChunks(output, chunks);
      console.log(`[Parakeet] Completed in ${((performance.now() - started) / 1000).toFixed(2)} s: ${chunks.length} audio chunk(s), ${result.segments?.length || 0} timed segment(s)`);
      progress?.(100);
      return { ...result, engine: model.engine, model: model.name };
    } catch (error) {
      console.error('[Parakeet] Failed:', error instanceof Error ? error.message : error);
      throw error;
    } finally { await fs.rm(workspace, { recursive: true, force: true }); }
  }
}
