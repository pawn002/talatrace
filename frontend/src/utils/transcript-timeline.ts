export interface QuietInterval { start: number; end: number }
export interface PauseRegion extends QuietInterval {
  quietSeconds: number;
  intervals: QuietInterval[];
}
export interface TimelineEntry extends QuietInterval {
  kind: 'speech' | 'pause' | 'no-speech';
  text: string;
}

/** Group brief interruptions without claiming they were silence or changing speech times. */
export function groupQuietIntervals(intervals: QuietInterval[], maxGapSeconds = 1.5): PauseRegion[] {
  const sorted = intervals
    .filter(interval => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.start >= 0 && interval.end > interval.start)
    .map(interval => ({ ...interval }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const regions: PauseRegion[] = [];
  for (const interval of sorted) {
    const previous = regions[regions.length - 1];
    if (previous && interval.start - previous.end <= maxGapSeconds + 1e-9) {
      previous.quietSeconds += Math.max(0, interval.end - Math.max(previous.end, interval.start));
      previous.end = Math.max(previous.end, interval.end);
      previous.intervals.push(interval);
    } else {
      regions.push({ ...interval, quietSeconds: interval.end - interval.start, intervals: [interval] });
    }
  }
  return regions;
}

export function buildTranscriptTimeline(result: {
  segments?: Array<QuietInterval & { text: string }>;
  quietIntervals?: QuietInterval[];
  noSpeechIntervals?: QuietInterval[];
}): TimelineEntry[] {
  const speech: TimelineEntry[] = (result.segments || []).map(segment => ({ ...segment, kind: 'speech', text: segment.text.trim() }));
  const pauses: TimelineEntry[] = groupQuietIntervals(result.quietIntervals || []).map(region => ({
    start: region.start,
    end: region.end,
    kind: 'pause',
    text: region.intervals.length === 1
      ? `Pause region (${region.quietSeconds.toFixed(1)} s quiet)`
      : `Pause region (${(region.end - region.start).toFixed(1)} s span; ${region.quietSeconds.toFixed(1)} s quiet; ${region.intervals.length} intervals with brief interruptions)`,
  }));
  // An empty VAD result still means detection succeeded. Do not substitute
  // volume measurements and present them as speech detection.
  const gaps: TimelineEntry[] = result.noSpeechIntervals === undefined ? pauses
    : result.noSpeechIntervals.map(interval => ({
      ...interval, kind: 'no-speech',
      text: `No speech detected (${(interval.end - interval.start).toFixed(1)} s)`,
    }));
  return [...speech, ...gaps].sort((a, b) => a.start - b.start || (a.kind === b.kind ? 0 : a.kind === 'speech' ? -1 : 1));
}
