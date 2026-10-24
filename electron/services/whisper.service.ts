import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import * as https from 'https';
import { createWriteStream } from 'fs';
import { parseQuietIntervals, QuietInterval } from './quiet-intervals';
import { alignmentPreset, parseWhisperTranscript } from './speech-alignment';
import { parseSpeechActivity } from './speech-activity';
import { app } from 'electron';
import { TranscriptionOptions, TranscriptionResult } from './types';

// Valid model names whitelist for security
const VALID_MODEL_NAMES = ['tiny', 'base', 'small', 'medium', 'large'] as const;
type ValidModelName = (typeof VALID_MODEL_NAMES)[number];

export class WhisperService {
  private whisperPath: string;
  private whisperBinDir: string;
  private modelsPath: string;
  private ffmpegPath: string;
  private vadModelPath: string;
  private initialized: boolean = false;
  private ffmpegAvailable: boolean = false;
  private availableModels = [
    { name: 'tiny', size: '39 MB', description: 'Fastest, least accurate' },
    { name: 'base', size: '74 MB', description: 'Fast, good accuracy' },
    { name: 'small', size: '244 MB', description: 'Balanced speed/accuracy' },
    { name: 'medium', size: '769 MB', description: 'Slower, better accuracy' },
    { name: 'large', size: '1550 MB', description: 'Slowest, best accuracy' },
  ];

  /**
   * Validates that a model name is in the allowed list
   */
  private isValidModelName(name: string): name is ValidModelName {
    return VALID_MODEL_NAMES.includes(name as ValidModelName);
  }

  constructor() {
    // Determine base path based on environment
    const isDev = !app.isPackaged;
    const basePath = isDev ? app.getAppPath() : process.resourcesPath;
    this.vadModelPath = path.join(basePath, 'models', 'ggml-silero-v5.1.2.bin');

    console.log('[WhisperService] Environment:', isDev ? 'development' : 'production');
    console.log('[WhisperService] Base path:', basePath);

    // Platform-specific binary paths — prefer Vulkan variant when available
    if (process.platform === 'win32') {
      const vulkanBinDir = path.join(basePath, 'whisper.cpp', 'build-vulkan', 'bin');
      const vulkanBin = path.join(vulkanBinDir, 'whisper-cli.exe');
      const baselineBinDir = path.join(basePath, 'whisper.cpp', 'build', 'bin', 'Release');
      const baselineBin = path.join(baselineBinDir, 'whisper-cli.exe');

      const vulkanExists = require('fs').existsSync(vulkanBin);
      if (vulkanExists) {
        this.whisperPath = vulkanBin;
        this.whisperBinDir = vulkanBinDir;
        console.log('[WhisperService] Vulkan backend selected');
      } else {
        this.whisperPath = baselineBin;
        this.whisperBinDir = baselineBinDir;
        console.log('[WhisperService] Baseline (CPU) backend selected');
      }

      this.ffmpegPath = path.join(basePath, 'ffmpeg', 'bin', 'ffmpeg.exe');
    } else {
      this.whisperPath = path.join(basePath, 'whisper.cpp', 'main');
      this.whisperBinDir = path.dirname(this.whisperPath);
      this.ffmpegPath = path.join(basePath, 'ffmpeg', 'bin', 'ffmpeg');
    }

    // Models stored in user data directory (writable location)
    this.modelsPath = path.join(app.getPath('userData'), 'models');

    console.log('[WhisperService] Whisper path:', this.whisperPath);
    console.log('[WhisperService] Models path:', this.modelsPath);
    console.log('[WhisperService] FFmpeg path:', this.ffmpegPath);
  }

  async initialize(): Promise<void> {
    // Ensure directories exist
    await this.ensureDirectories();

    // Migrate models from old location if needed
    await this.migrateModelsIfNeeded();

    // Check if whisper binary exists
    const binaryExists = await this.checkBinary();
    if (!binaryExists) {
      throw new Error(
        'Whisper binary not found. Please rebuild the application.'
      );
    }

    // Check if ffmpeg is available
    this.ffmpegAvailable = await this.checkFfmpeg();
    if (this.ffmpegAvailable) {
      console.log('[WhisperService] ffmpeg detected - multi-format audio support enabled');
    } else {
      console.warn(
        '[WhisperService] ffmpeg not found - only WAV files will be supported. Install ffmpeg for multi-format support.'
      );
    }

    // Check for at least one model
    const models = await this.getInstalledModels();
    if (models.length === 0) {
      console.log('[WhisperService] No models found, downloading tiny model...');
      await this.downloadModel('tiny');
    }

    this.initialized = true;
    console.log('[WhisperService] Initialization complete');
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.modelsPath, { recursive: true });
  }

  private async migrateModelsIfNeeded(): Promise<void> {
    try {
      const migrationFlag = path.join(app.getPath('userData'), '.models-migrated');

      // Check if already migrated
      try {
        await fs.access(migrationFlag);
        return; // Already migrated
      } catch {
        // Migration flag doesn't exist, proceed with migration
      }

      // Check if old models directory exists
      const oldModelsPath = path.join(app.getAppPath(), 'models');
      try {
        await fs.access(oldModelsPath);
        console.log('[WhisperService] Migrating models from old location...');

        const files = await fs.readdir(oldModelsPath);
        const binFiles = files.filter(f => f.endsWith('.bin'));

        if (binFiles.length > 0) {
          await fs.mkdir(this.modelsPath, { recursive: true });

          for (const file of binFiles) {
            const srcPath = path.join(oldModelsPath, file);
            const destPath = path.join(this.modelsPath, file);

            // Only copy if destination doesn't exist
            try {
              await fs.access(destPath);
              console.log(`[WhisperService] Model ${file} already exists, skipping`);
            } catch {
              await fs.copyFile(srcPath, destPath);
              console.log(`[WhisperService] Migrated model: ${file}`);
            }
          }
        }

        // Create migration flag
        await fs.writeFile(migrationFlag, new Date().toISOString());
        console.log('[WhisperService] Model migration complete');
      } catch {
        // Old models directory doesn't exist, nothing to migrate
        await fs.writeFile(migrationFlag, new Date().toISOString());
      }
    } catch (error) {
      console.error('[WhisperService] Model migration error:', error);
      // Don't fail initialization if migration fails
    }
  }

  private async checkBinary(): Promise<boolean> {
    try {
      await fs.access(this.whisperPath);
      return true;
    } catch {
      return false;
    }
  }

  private async checkFfmpeg(): Promise<boolean> {
    try {
      await fs.access(this.ffmpegPath);
      console.log(`[WhisperService] Found bundled ffmpeg at: ${this.ffmpegPath}`);
      return true;
    } catch {
      console.warn(`[WhisperService] Bundled ffmpeg not found at: ${this.ffmpegPath}`);
      return false;
    }
  }

  async getAvailableModels(): Promise<any[]> {
    const installed = await this.getInstalledModels();

    return this.availableModels.map((model) => ({
      ...model,
      installed: installed.includes(model.name),
      path: path.join(this.modelsPath, `ggml-${model.name}.bin`),
    }));
  }

  private async getInstalledModels(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.modelsPath);
      return files
        .filter((file) => file.startsWith('ggml-') && file.endsWith('.bin'))
        .map((file) => file.replace('ggml-', '').replace('.bin', ''))
        .filter(name => this.isValidModelName(name));
    } catch {
      return [];
    }
  }

  async downloadModel(
    modelName: string,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    // Validate model name against whitelist to prevent path injection
    if (!this.isValidModelName(modelName)) {
      throw new Error(
        `Invalid model name: ${modelName}. Valid models are: ${VALID_MODEL_NAMES.join(', ')}`
      );
    }

    const modelUrl = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${modelName}.bin`;
    const modelPath = path.join(this.modelsPath, `ggml-${modelName}.bin`);

    // Ensure models directory exists
    await fs.mkdir(this.modelsPath, { recursive: true });

    return new Promise((resolve, reject) => {
      const file = createWriteStream(modelPath);

      const downloadFile = (url: string) => {
        https
          .get(url, (response) => {
            // Follow redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
              const redirectUrl = response.headers.location;
              if (redirectUrl) {
                console.log(`[WhisperService] Following redirect to: ${redirectUrl}`);
                downloadFile(redirectUrl);
                return;
              }
            }

            const totalSize = parseInt(
              response.headers['content-length'] || '0',
              10
            );
            let downloadedSize = 0;

            console.log(
              `[WhisperService] Downloading ${modelName} model (${(totalSize / 1024 / 1024).toFixed(2)} MB)...`
            );

            response.on('data', (chunk) => {
              downloadedSize += chunk.length;
              if (progressCallback && totalSize > 0) {
                const progress = (downloadedSize / totalSize) * 100;
                progressCallback(progress);
              }
            });

            response.pipe(file);

            file.on('finish', () => {
              file.close();
              console.log(`[WhisperService] Model ${modelName} downloaded successfully`);
              resolve();
            });
          })
          .on('error', async (err) => {
            file.close();
            try {
              await fs.unlink(modelPath);
            } catch {}
            reject(err);
          });
      };

      downloadFile(modelUrl);
    });
  }

  async transcribe(
    audioPath: string,
    options: TranscriptionOptions,
    progressCallback?: (progress: number) => void
  ): Promise<TranscriptionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Validate model name against whitelist
    const modelName = options.model || 'base';
    if (!this.isValidModelName(modelName)) {
      throw new Error(
        `Invalid model name: ${modelName}. Valid models are: ${VALID_MODEL_NAMES.join(', ')}`
      );
    }

    // Canonicalize audio path to prevent path traversal
    const resolvedAudioPath = path.resolve(audioPath);

    const modelPath = path.join(this.modelsPath, `ggml-${modelName}.bin`);

    // Check if model exists
    try {
      await fs.access(modelPath);
    } catch {
      throw new Error(
        `Model ${options.model} not found. Please download it first.`
      );
    }

    // Check if audio needs conversion
    const ext = path.extname(resolvedAudioPath).toLowerCase();
    let processedAudioPath = resolvedAudioPath;
    let needsCleanup = false;

    // Convert non-WAV files to WAV format
    if (ext !== '.wav') {
      console.log(`[WhisperService] Non-WAV file detected (${ext}), converting to WAV...`);
      try {
        processedAudioPath = await this.convertAudioToWav(audioPath);
        needsCleanup = true;
      } catch (error: any) {
        throw new Error(
          `Audio conversion failed: ${error.message}. Only WAV files are supported without ffmpeg.`
        );
      }
    }

    // Prepare whisper command arguments
    const args = [
      '-m',
      modelPath,
      '-f',
      processedAudioPath,
      '-t',
      (options.threads || 4).toString(),
      '-p',
      (options.processors || 1).toString(),
    ];

    if (options.language) {
      args.push('-l', options.language);
    }

    if (options.translate) {
      args.push('--translate');
    }

    if (options.outputFormat === 'json') {
      args.push(options.alignTimestamps && alignmentPreset(modelName) ? '-ojf' : '-oj');
    } else if (options.outputFormat === 'srt') {
      args.push('-osrt');
    } else if (options.outputFormat === 'vtt') {
      args.push('-ovtt');
    }

    if (!options.timestamps) {
      args.push('-nt');
    }
    const preset = options.alignTimestamps ? alignmentPreset(modelName) : undefined;
    if (preset) {
      // DTW requires cross-attention weights; flash attention would silently disable it.
      args.push('-dtw', preset, '-nfa');
    }

    // Log the command being executed
    console.log('[WhisperService] Executing whisper command:', this.whisperPath);
    console.log('[WhisperService] Arguments:', args);

    try {
    return await new Promise<TranscriptionResult>((resolve, reject) => {
      let whisperProcess;

      try {
        whisperProcess = spawn(this.whisperPath, args, {
          env: { ...process.env, PATH: `${this.whisperBinDir}${path.delimiter}${process.env.PATH}` },
        });
      } catch (spawnError: any) {
        if (needsCleanup) void fs.rm(path.dirname(processedAudioPath), { recursive: true, force: true }).catch(() => {});
        console.error('[WhisperService] Failed to spawn whisper process:', spawnError);
        reject(new Error(`Failed to start whisper: ${spawnError.message}`));
        return;
      }

      let output = '';
      let error = '';
      let lastProgress = 0;

      whisperProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log('[WhisperService] Whisper stdout:', text);

        // Parse progress from output if possible
        const progressMatch = text.match(/(\d+)%/);
        if (progressMatch && progressCallback) {
          const progress = parseInt(progressMatch[1], 10);
          if (progress > lastProgress) {
            lastProgress = progress;
            progressCallback(progress);
          }
        }
      });

      whisperProcess.stderr.on('data', (data) => {
        const message = data.toString();
        console.log('[WhisperService] Whisper stderr:', message);

        // Some progress info might come through stderr
        if (message.includes('%') && progressCallback) {
          const progressMatch = message.match(/(\d+)%/);
          if (progressMatch) {
            const progress = parseInt(progressMatch[1], 10);
            if (progress > lastProgress) {
              lastProgress = progress;
              progressCallback(progress);
            }
          }
        }

        error += message;
      });

      whisperProcess.on('close', async (code) => {
        console.log(`[WhisperService] Whisper process closed with code: ${code}`);

        if (code === 0) {
          // Parse the output based on format
          if (options.outputFormat === 'json') {
            // whisper-cli writes JSON to <audiofile>.json on disk, not stdout
            const jsonFilePath = processedAudioPath + '.json';
            try {
              const jsonRaw = await fs.readFile(jsonFilePath, 'utf8');
              await fs.unlink(jsonFilePath).catch(() => {});
              const jsonResult = JSON.parse(jsonRaw);
              const transcript = parseWhisperTranscript(jsonResult, Boolean(preset));
              resolve({
                ...transcript,
                ...(options.alignTimestamps && !preset ? { alignmentWarning: 'Audio alignment is not available for this model variant. Original approximate speech times are shown.' } : {}),
                language: jsonResult.result?.language || jsonResult.language,
                duration: jsonResult.duration,
              });
            } catch (e) {
              console.error('[WhisperService] Failed to read/parse JSON output file:', e);
              reject(new Error('Could not read the timestamped transcript. Please retry transcription.'));
            }
          } else {
            resolve({ text: output });
          }
        } else {
          const errorMsg = `Whisper process exited with code ${code}. Error: ${error || 'No error output'}. Output: ${output || 'No output'}`;
          console.error(`[WhisperService] ${errorMsg}`);
          reject(new Error(errorMsg));
        }
        if (needsCleanup) {
          await fs.rm(path.dirname(processedAudioPath), { recursive: true, force: true }).catch(() => {});
        }
      });

      whisperProcess.on('error', async (err) => {
        console.error('[WhisperService] Whisper process error event:', err);

        // Clean up converted WAV file if we created one
        if (needsCleanup) {
          try {
            await fs.rm(path.dirname(processedAudioPath), { recursive: true, force: true });
          } catch (cleanupError) {
            console.error('[WhisperService] Failed to cleanup converted file:', cleanupError);
          }
        }

        reject(new Error(`Whisper process error: ${err.message}`));
      });
    });
    } catch (error) {
      if (!preset) throw error;
      // Unsupported hardware/builds must not lose a successfully captured answer.
      const fallback = await this.transcribe(audioPath, { ...options, alignTimestamps: false }, progressCallback);
      return { ...fallback, originalSegments: fallback.segments, alignmentWarning: 'Audio alignment could not run on this model or device. Original approximate speech times are shown.' };
    }
  }

  async getAudioDuration(audioPath: string): Promise<number | undefined> {
    if (!this.ffmpegAvailable) {
      console.warn('[WhisperService] ffmpeg not available, cannot get audio duration');
      return undefined;
    }

    // Canonicalize audio path
    const resolvedAudioPath = path.resolve(audioPath);

    return new Promise((resolve) => {
      // Use ffmpeg to get duration by analyzing the file
      const ffmpegProcess = spawn(this.ffmpegPath, [
        '-i',
        resolvedAudioPath,
        '-f',
        'null',
        '-',
      ]);

      let errorOutput = '';

      ffmpegProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpegProcess.on('close', () => {
        // Parse duration from ffmpeg output: "Duration: HH:MM:SS.mmm"
        const durationMatch = errorOutput.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d{2})/);

        if (durationMatch) {
          const hours = parseInt(durationMatch[1], 10);
          const minutes = parseInt(durationMatch[2], 10);
          const seconds = parseFloat(durationMatch[3]);

          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          console.log(`[WhisperService] Audio duration: ${totalSeconds.toFixed(2)}s`);
          resolve(totalSeconds);
        } else {
          console.warn('[WhisperService] Failed to extract duration from ffmpeg output');
          resolve(undefined);
        }
      });

      ffmpegProcess.on('error', (err) => {
        console.warn('[WhisperService] ffmpeg error:', err);
        resolve(undefined);
      });
    });
  }

  async detectQuietIntervals(audioPath: string): Promise<QuietInterval[]> {
    if (!this.initialized) await this.initialize();
    return new Promise((resolve, reject) => {
      const process = spawn(this.ffmpegPath, [
        '-i', path.resolve(audioPath), '-af', 'silencedetect=noise=-35dB:d=1.5', '-f', 'null', '-',
      ]);
      let output = '';
      process.stderr.on('data', chunk => { output += chunk.toString(); });
      process.on('error', reject);
      process.on('close', code => code === 0
        ? resolve(parseQuietIntervals(output))
        : reject(new Error('Could not analyze recording timing. Please retry.')));
    });
  }

  async detectSpeechActivity(audioPath: string): Promise<Pick<TranscriptionResult, 'speechIntervals' | 'noSpeechIntervals' | 'speechDetectionMethod'>> {
    if (!this.initialized) await this.initialize();
    const binary = path.join(this.whisperBinDir, process.platform === 'win32' ? 'whisper-vad-speech-segments.exe' : 'whisper-vad-speech-segments');
    await fs.access(binary);
    await fs.access(this.vadModelPath);
    // Decode independently; VAD must never remove samples from Whisper's timeline.
    const wav = await this.convertAudioToWav(audioPath);
    try {
      const duration = await this.getAudioDuration(wav);
      if (!duration) throw new Error('Could not measure recording duration');
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(binary, ['-vm', this.vadModelPath, '-f', wav, '-np'], {
          env: { ...process.env, PATH: `${this.whisperBinDir}${path.delimiter}${process.env.PATH}` },
        });
        let stdout = '';
        child.stdout.on('data', chunk => { stdout += chunk.toString(); });
        // Drain native backend diagnostics without retaining audio-derived logs.
        child.stderr.on('data', () => {});
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error('Speech detection failed')));
      });
      return { ...parseSpeechActivity(output, duration), speechDetectionMethod: 'silero-v5.1.2' };
    } finally {
      await fs.rm(path.dirname(wav), { recursive: true, force: true }).catch(() => {});
    }
  }

  async convertAudioToWav(inputPath: string): Promise<string> {
    if (!this.ffmpegAvailable) {
      throw new Error(
        'ffmpeg is not available. Please run setup to install ffmpeg.'
      );
    }

    // Canonicalize input path to prevent path traversal
    const resolvedInputPath = path.resolve(inputPath);

    // Never overwrite an existing WAV beside the user's imported recording.
    const conversionRoot = path.join(app.getPath('temp'), 'whisper-interview-recordings');
    await fs.mkdir(conversionRoot, { recursive: true });
    const conversionWorkspace = await fs.mkdtemp(path.join(conversionRoot, 'recording-conversion-'));
    const outputPath = path.join(conversionWorkspace, 'audio.wav');

    console.log(
      `[WhisperService] Converting ${resolvedInputPath} to WAV format using bundled ffmpeg...`
    );

    return new Promise((resolve, reject) => {
      const ffmpegProcess = spawn(this.ffmpegPath, [
        '-i',
        resolvedInputPath,
        '-ar',
        '16000', // 16kHz sample rate
        '-ac',
        '1', // Mono
        '-c:a',
        'pcm_s16le', // 16-bit PCM
        outputPath,
        '-y', // Overwrite output
      ]);

      let errorOutput = '';

      ffmpegProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`[WhisperService] Audio converted successfully to: ${outputPath}`);
          resolve(outputPath);
        } else {
          void fs.rm(conversionWorkspace, { recursive: true, force: true }).catch(() => {});
          console.error('[WhisperService] ffmpeg conversion failed:', errorOutput);
          reject(
            new Error(
              `Failed to convert audio file. ffmpeg exit code: ${code}`
            )
          );
        }
      });

      ffmpegProcess.on('error', (err) => {
        void fs.rm(conversionWorkspace, { recursive: true, force: true }).catch(() => {});
        console.error('[WhisperService] ffmpeg process error:', err);
        reject(
          new Error(
            `Failed to start ffmpeg: ${err.message}. ffmpeg binary may be missing or corrupted.`
          )
        );
      });
    });
  }
}
