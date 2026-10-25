import { TranscriptionOptions, TranscriptionResult } from './types';

export interface RecognitionEngine {
  transcribe(audioPath: string, options: TranscriptionOptions, progress?: (progress: number) => void, context?: RecognitionContext): Promise<TranscriptionResult>;
}

export interface RecognitionContext { noSpeechIntervals?: Array<{ start: number; end: number }> }
