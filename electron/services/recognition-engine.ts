import { TranscriptionOptions, TranscriptionResult } from './types';

export interface RecognitionEngine {
  transcribe(audioPath: string, options: TranscriptionOptions, progress?: (progress: number) => void): Promise<TranscriptionResult>;
}
