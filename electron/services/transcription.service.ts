import { BrowserWindow } from 'electron';
import { SpeechService } from './speech.service';
import { TranscriptionJob, TranscriptionOptions, TranscriptionResult } from './types';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { performance } from 'perf_hooks';

export class TranscriptionService {
  private jobs: Map<string, TranscriptionJob> = new Map();
  private transcriptionHistory: TranscriptionJob[] = [];
  private whisperService: SpeechService;
  private mainWindow: BrowserWindow | null;
  private busy = false;

  constructor(mainWindow: BrowserWindow | null) {
    this.mainWindow = mainWindow;
    this.whisperService = new SpeechService();
    this.whisperService.initialize().catch((error) => {
      console.error('[TranscriptionService] Failed to initialize SpeechService:', error);
    });
  }

  async processAudio(
    audioPath: string,
    options: TranscriptionOptions,
    cleanup?: () => Promise<void>
  ): Promise<TranscriptionJob> {
    if (this.busy) throw new Error('Please wait for the current transcription to finish.');
    this.busy = true;
    const jobId = uuidv4();

    const job: TranscriptionJob = {
      id: jobId,
      status: 'pending',
      progress: 0,
      startedAt: new Date(),
      filePath: audioPath,
      fileName: path.basename(audioPath),
      options,
    };

    this.jobs.set(jobId, job);

    // Start processing in the background
    this.processTranscriptionJob(job, cleanup);

    return job;
  }

  private async processTranscriptionJob(job: TranscriptionJob, cleanup?: () => Promise<void>): Promise<void> {
    try {
      job.status = 'processing';
      const processingStartTime = performance.now();

      await this.whisperService.initialize();
      // Get audio duration before transcription
      job.audioDuration = await this.whisperService.getAudioDuration(job.filePath);
      const quietIntervals = job.options.detectQuietIntervals
        ? await this.whisperService.detectQuietIntervals(job.filePath) : undefined;
      let speechActivity: Partial<TranscriptionResult> = {};
      if (job.options.detectQuietIntervals) {
        try {
          speechActivity = await this.whisperService.detectSpeechActivity(job.filePath);
        } catch {
          speechActivity = { speechDetectionWarning: 'Speech detection unavailable. Only low-level quiet regions are shown; background noise can hide gaps in speech.' };
        }
      }

      // Small delay to ensure IPC event listeners are ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      this.emitProgress(job.id, 5, 'Starting transcription');

      // Prepare whisper options - always use JSON format for structured data
      const whisperOptions: TranscriptionOptions = {
        model: job.options.model || 'base',
        language: job.options.language,
        threads: job.options.threads || 4,
        processors: 1,
        outputFormat: 'json',
        timestamps: true,
        alignTimestamps: job.options.alignTimestamps,
        translate: job.options.translate,
      };

      this.emitProgress(job.id, 10, 'Loading model');

      // Transcribe using SpeechService
      const result = await this.whisperService.transcribe(
        job.filePath,
        whisperOptions,
        (progress) => {
          // Map whisper progress (0-100) to our progress (10-90)
          const mappedProgress = 10 + progress * 0.8;
          job.progress = Math.round(mappedProgress);
          this.emitProgress(
            job.id,
            job.progress,
            'Transcribing audio'
          );
        },
        { noSpeechIntervals: speechActivity.noSpeechIntervals }
      );

      job.transcriptionTime = performance.now() - processingStartTime;
      job.result = { ...result, ...speechActivity, ...(quietIntervals ? { quietIntervals } : {}),
        duration: job.audioDuration, processingTimeMs: job.transcriptionTime };
      job.status = 'completed';
      job.completedAt = new Date();
      job.progress = 100;

      // Add to history
      this.transcriptionHistory.unshift(job);
      if (this.transcriptionHistory.length > 50) {
        this.transcriptionHistory = this.transcriptionHistory.slice(0, 50);
      }

    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = new Date();

    } finally {
      // The job owns its temporary recording until Whisper has finished reading it.
      try { await cleanup?.(); } catch (error) { console.error('Recording cleanup failed:', error); }
      this.busy = false;
    }
    if (job.status === 'completed') {
      this.emitProgress(job.id, 100, 'Completed');
      this.emitCompleted(job.result);
    } else {
      this.emitError(job.error || 'Transcription failed');
    }
  }

  private emitProgress(jobId: string, progress: number, message?: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('transcription-progress', {
        jobId,
        progress,
        message,
      });
    }
  }

  private emitCompleted(result: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('transcription-completed', result);
    }
  }

  private emitError(error: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('transcription-error', error);
    }
  }

  async getJobStatus(jobId: string): Promise<TranscriptionJob | undefined> {
    return this.jobs.get(jobId);
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed') {
      return false;
    }

    job.status = 'cancelled';
    job.completedAt = new Date();
    this.emitError('Job cancelled by user');

    return true;
  }

  getTranscriptionHistory(): TranscriptionJob[] {
    return this.transcriptionHistory;
  }

  async getAvailableModels() {
    return await this.whisperService.getAvailableModels();
  }

  async downloadModel(
    modelName: string,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    return await this.whisperService.downloadModel(modelName, progressCallback);
  }
}
