/** FFmpeg decoded output time works for MediaRecorder WebM without duration headers. */
export function decodedAudioDuration(progress: string): number | undefined {
  const times = [...progress.matchAll(/^out_time_us=(\d+)\s*$/gm)].map(match => Number(match[1]) / 1_000_000);
  const seconds = times[times.length - 1];
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}
