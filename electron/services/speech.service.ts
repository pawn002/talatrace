import { app } from 'electron';
import * as path from 'path';
import { WhisperService } from './whisper.service';
import { TranscribeEngine } from './transcribe-engine';
import { ModelStore } from './model-store';
import { speechModel } from './model-catalog';
import { RecognitionEngine, RecognitionContext } from './recognition-engine';
import { TranscriptionOptions, TranscriptionResult } from './types';

/** Share preprocessing/VAD while selecting recognition independently of the workflow. */
export class SpeechService implements RecognitionEngine {
  private models = new ModelStore(path.join(app.getPath('userData'), 'models'));
  private whisper = new WhisperService(this.models);
  private alternate = new TranscribeEngine(app.isPackaged ? process.resourcesPath : app.getAppPath(), this.models,
    input => this.whisper.convertAudioToWav(input));

  initialize() { return this.whisper.initialize(); }
  getAudioDuration(input: string) { return this.whisper.getAudioDuration(input); }
  detectQuietIntervals(input: string) { return this.whisper.detectQuietIntervals(input); }
  detectSpeechActivity(input: string) { return this.whisper.detectSpeechActivity(input); }

  async getAvailableModels() {
    const alternateReady = await this.alternate.available();
    return (await this.models.list()).map(model => ({ ...model,
      available: model.engine === 'whisper.cpp' || alternateReady,
      unavailableReason: model.engine === 'transcribe.cpp' && !alternateReady ? 'Parakeet runtime is not included in this build.' : undefined,
    }));
  }

  async downloadModel(name: string, progress?: (progress: number) => void) {
    if (speechModel(name).engine === 'transcribe.cpp' && !await this.alternate.available()) throw new Error('Parakeet runtime is not included in this build.');
    return this.models.download(name, progress);
  }

  deleteModel(name: string) { return this.models.delete(name); }

  async transcribe(input: string, options: TranscriptionOptions, progress?: (progress: number) => void, context?: RecognitionContext): Promise<TranscriptionResult> {
    await this.initialize();
    const model = speechModel(options.model);
    const engine: RecognitionEngine = model.engine === 'whisper.cpp' ? this.whisper : this.alternate;
    let warning: string | undefined;
    if (model.engine === 'transcribe.cpp' && context?.noSpeechIntervals === undefined) {
      try { context = { noSpeechIntervals: (await this.whisper.detectSpeechActivity(input)).noSpeechIntervals }; }
      catch { warning = 'Speech detection unavailable. Parakeet could not partition long pauses; speech after long pauses may be missed.'; }
    }
    return { ...await engine.transcribe(input, options, progress, context),
      ...(warning ? { speechDetectionWarning: warning } : {}), engine: model.engine, model: model.name, modelName: model.displayName };
  }
}
