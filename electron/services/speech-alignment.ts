import { TranscriptionResult } from './types';

type Segment = NonNullable<TranscriptionResult['segments']>[number];
interface Token { id: number; text: string; t_dtw: number }
interface NativeSegment { text: string; offsets?: { from: number; to: number }; start?: number; end?: number; tokens?: Token[] }

export function alignmentPreset(model: string): string | undefined {
  // The app's unversioned "large" alias does not identify its alignment-head variant.
  return ['tiny', 'base', 'small', 'medium'].includes(model) ? model : undefined;
}

export function parseWhisperTranscript(data: {
  model?: { multilingual?: boolean };
  transcription?: NativeSegment[];
  segments?: NativeSegment[];
}, useAlignment: boolean): Pick<TranscriptionResult, 'text' | 'segments' | 'originalSegments' | 'timingMethod' | 'alignmentWarning'> {
  const raw = data.transcription || data.segments || [];
  const originalSegments: Segment[] = raw.map(segment => ({
    start: segment.offsets ? segment.offsets.from / 1000 : segment.start!,
    end: segment.offsets ? segment.offsets.to / 1000 : segment.end!,
    text: segment.text,
  })).filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.start >= 0 && segment.end >= segment.start && typeof segment.text === 'string');
  const text = originalSegments.map(segment => segment.text).join('');
  if (!useAlignment || !originalSegments.length) return { text, segments: originalSegments, timingMethod: 'whisper-segments' };

  const aligned: Segment[] = [];
  let lastTime = -1;
  // Full JSON uses 10 ms units for t_dtw, unlike offsets which are milliseconds.
  const eot = data.model?.multilingual === false ? 50256 : 50257;
  for (const segment of raw) {
    const tokens = (segment.tokens || []).filter(token => token.id >= 0 && token.id < eot);
    if (!tokens.length || tokens.map(token => token.text).join('').trim() !== segment.text.trim()) {
      return fallback();
    }
    let current: Segment | undefined;
    for (const token of tokens) {
      // Closing punctuation has no spoken duration. Its DTW anchor can drift
      // into silence, so preserve the text without extending a speech range.
      const preceding = current || aligned[aligned.length - 1];
      if (preceding && typeof token.text === 'string' && /^[\p{Pe}\p{Pf}.,!?;:…。，！？；："'’”\s]+$/u.test(token.text)) {
        preceding.text += token.text;
        continue;
      }
      const time = token.t_dtw / 100;
      if (!Number.isFinite(time) || time < 0 || time < lastTime || typeof token.text !== 'string') return fallback();
      const gap = time - lastTime;
      const sentenceEnded = current && /[.!?。！？]["'”’)]?\s*$/.test(current.text);
      if (!current || gap >= 1.5 || sentenceEnded || (current.text.length >= 120 && /^\s/.test(token.text))) {
        current = { start: time, end: time, text: token.text };
        aligned.push(current);
      } else {
        current.text += token.text;
        current.end = time;
      }
      lastTime = time;
    }
  }
  return { text, segments: aligned, originalSegments, timingMethod: 'whisper-dtw' };

  function fallback() {
    return {
      text, segments: originalSegments, originalSegments, timingMethod: 'whisper-segments' as const,
      alignmentWarning: 'Audio alignment was unavailable or inconsistent. Original approximate speech times are shown.',
    };
  }
}
