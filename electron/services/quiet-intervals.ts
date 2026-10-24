export interface QuietInterval { start: number; end: number }

/** Parse FFmpeg's silence detector without cutting silence out of the audio. */
export function parseQuietIntervals(output: string): QuietInterval[] {
  const intervals: QuietInterval[] = [];
  let start: number | undefined;
  for (const match of output.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g)) {
    const seconds = Math.max(0, Number(match[2]));
    if (match[1] === 'start') start = seconds;
    else if (start !== undefined) {
      if (seconds - start >= 1.5) intervals.push({ start, end: seconds });
      start = undefined;
    }
  }
  return intervals;
}
