import { TranscriptionResult } from './types';

/** Parse the pinned transcribe.cpp JSONL contract. Timings stay on the original audio clock. */
export function parseTransducerTranscript(output: string): TranscriptionResult {
  const rows = output.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
  const results = rows.filter(row => row.type !== 'batch_header');
  if (results.length !== 1) throw new Error('Speech engine returned an unexpected result count');
  const result = results[0];
  if (result.error) throw new Error(`Speech engine: ${result.error}`);
  if (typeof result.text !== 'string') throw new Error('Speech engine returned no transcript');
  const segments: NonNullable<TranscriptionResult['segments']> = [];
  for (const token of result.token_segments || []) {
    if (typeof token.text !== 'string' || !Number.isFinite(token.t0_ms) || !Number.isFinite(token.t1_ms)
      || token.t0_ms < 0 || token.t1_ms < token.t0_ms || (segments.length && token.t0_ms / 1000 < segments[segments.length - 1].start)) {
      return { text: result.text, alignmentWarning: 'Token timings were invalid. The complete recognition text is preserved without speech timestamps.' };
    }
    const start = token.t0_ms / 1000;
    const end = token.t1_ms / 1000;
    const previous = segments[segments.length - 1];
    // Punctuation is not spoken duration; its emission can drift into a pause.
    if (previous && /^[\p{Pe}\p{Pf}.,!?;:…。，！？；："'’”\s]+$/u.test(token.text)) {
      previous.text += token.text;
      continue;
    }
    if (previous && start - previous.end < 1.5 && !/[.!?]["'”’)]?\s*$/.test(previous.text) && previous.text.length < 120) {
      previous.text += token.text;
      previous.end = Math.max(previous.end, end);
    } else segments.push({ start, end, text: token.text });
  }
  // Reject a conversion that loses/reorders words; retain text rather than fabricating times.
  const normalize = (text: string) => text.replace(/\s+/gu, '').trim();
  if (result.text.trim() && (!segments.length || normalize(segments.map(segment => segment.text).join('')) !== normalize(result.text))) {
    return { text: result.text, alignmentWarning: 'Token timings did not cover the transcript. The complete recognition text is preserved without speech timestamps.' };
  }
  return { text: result.text, segments, timingMethod: 'transducer-tokens' };
}
