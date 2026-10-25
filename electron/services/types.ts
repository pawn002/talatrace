export interface TranscriptionOptions {
  model: string;
  language?: string;
  translate?: boolean;
  threads?: number;
  processors?: number;
  outputFormat?: 'txt' | 'srt' | 'vtt' | 'json';
  timestamps?: boolean;
  detectQuietIntervals?: boolean;
  alignTimestamps?: boolean;
}

export interface TranscriptionResult {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language?: string;
  duration?: number;
  processingTimeMs?: number;
  modelName?: string;
  quietIntervals?: Array<{ start: number; end: number }>;
  originalSegments?: Array<{ start: number; end: number; text: string }>;
  timingMethod?: 'whisper-segments' | 'whisper-dtw' | 'transducer-tokens';
  model?: string;
  engine?: 'whisper.cpp' | 'transcribe.cpp';
  alignmentWarning?: string;
  speechIntervals?: Array<{ start: number; end: number }>;
  noSpeechIntervals?: Array<{ start: number; end: number }>;
  speechDetectionMethod?: 'silero-v5.1.2';
  speechDetectionWarning?: string;
}

export interface TranscriptionJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  result?: any;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  filePath: string;
  fileName?: string;
  audioDuration?: number;
  transcriptionTime?: number;
  options: TranscriptionOptions;
}
