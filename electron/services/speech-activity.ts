export interface AudioInterval { start: number; end: number }

/** The bundled whisper-vad-speech-segments helper prints centiseconds. */
export function parseSpeechActivity(output: string, duration: number): {
  speechIntervals: AudioInterval[]; noSpeechIntervals: AudioInterval[];
} {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Missing audio duration');
  const count = output.match(/Detected (\d+) speech segments:/);
  if (!count) throw new Error('Missing speech detection results');
  const matches = [...output.matchAll(/Speech segment (\d+): start = ([\d.]+), end = ([\d.]+)/g)];
  if (matches.length !== Number(count[1])) throw new Error('Incomplete speech detection results');
  const speechIntervals: AudioInterval[] = [];
  for (const [index, match] of matches.entries()) {
    const start = Number(match[2]) / 100;
    const end = Number(match[3]) / 100;
    if (Number(match[1]) !== index || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || start >= duration || end > duration + 0.05) {
      throw new Error('Invalid speech detection interval');
    }
    const previous = speechIntervals[speechIntervals.length - 1];
    if (previous && start < previous.start) throw new Error('Unordered speech detection results');
    if (previous && start <= previous.end) previous.end = Math.min(duration, Math.max(previous.end, end));
    else speechIntervals.push({ start, end: Math.min(end, duration) });
  }
  const noSpeechIntervals: AudioInterval[] = [];
  let cursor = 0;
  for (const interval of speechIntervals) {
    if (interval.start - cursor >= 1.5) noSpeechIntervals.push({ start: cursor, end: interval.start });
    cursor = interval.end;
  }
  if (duration - cursor >= 1.5) noSpeechIntervals.push({ start: cursor, end: duration });
  return { speechIntervals, noSpeechIntervals };
}
