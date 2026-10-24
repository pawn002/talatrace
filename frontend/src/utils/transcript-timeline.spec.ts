import { buildTranscriptTimeline, groupQuietIntervals } from './transcript-timeline';

describe('pause regions', () => {
  it('uses independent speech gaps while preserving recognition inside a detector disagreement', () => {
    const timeline = buildTranscriptTimeline({
      segments: [{ start: 10, end: 11, text: 'Recognized text' }],
      noSpeechIntervals: [{ start: 6, end: 36 }],
      quietIntervals: [{ start: 12, end: 14 }],
    });
    expect(timeline).toEqual([
      { start: 6, end: 36, kind: 'no-speech', text: 'No speech detected (30.0 s)' },
      { start: 10, end: 11, kind: 'speech', text: 'Recognized text' },
    ]);
  });

  it('does not substitute volume-based regions when speech detection found no long gaps', () => {
    expect(buildTranscriptTimeline({ noSpeechIntervals: [], quietIntervals: [{ start: 0, end: 3 }] })).toEqual([]);
  });
  const measured = [
    { start: 5.921, end: 8.870 },
    { start: 18.550, end: 21.324 },
    { start: 21.337, end: 23.121 },
    { start: 23.812, end: 29.565 },
    { start: 29.638, end: 32.874 },
    { start: 32.964, end: 34.909 },
    { start: 36.398, end: 40.442 },
    { start: 40.467, end: 44.652 },
    { start: 45.980, end: 50.285 },
  ];

  it('groups the reported long pause without counting its interruptions as quiet', () => {
    const original = JSON.stringify(measured);
    const regions = groupQuietIntervals(measured);
    expect(regions).toHaveLength(2);
    expect(regions[1].start).toBe(18.550);
    expect(regions[1].end).toBe(50.285);
    expect(regions[1].quietSeconds).toBeCloseTo(28.026, 3);
    expect(regions[1].intervals).toEqual(measured.slice(1));
    expect(JSON.stringify(measured)).toBe(original);
  });

  it('orders pause regions with speech and leaves overlapping speech estimates untouched', () => {
    const segments = [
      { start: 0, end: 8, text: 'First statement' },
      { start: 8, end: 14, text: 'Describing a pause' },
      { start: 14, end: 20, text: 'Counting silently' },
      { start: 30, end: 56, text: 'Finished' },
    ];
    const timeline = buildTranscriptTimeline({ segments, quietIntervals: measured });
    expect(timeline.map(entry => entry.start)).toEqual([0, 5.921, 8, 14, 18.550, 30]);
    expect(timeline.find(entry => entry.kind === 'pause' && entry.start === 18.550)?.text)
      .toBe('Pause region (31.7 s span; 28.0 s quiet; 8 intervals with brief interruptions)');
    expect(timeline.find(entry => entry.text === 'Finished')).toEqual({ ...segments[3], kind: 'speech' });
  });

  it('keeps longer interruptions separate and merges the inclusive 1.5 second boundary', () => {
    expect(groupQuietIntervals([{ start: 0, end: 2 }, { start: 3.5, end: 5 }, { start: 6.501, end: 9 }]))
      .toHaveLength(2);
  });

  it('handles unsorted and overlapping measurements without double-counting quiet time', () => {
    const regions = groupQuietIntervals([{ start: 2, end: 6 }, { start: 0, end: 4 }, { start: 1, end: 2 }]);
    expect(regions).toHaveLength(1);
    expect(regions[0].quietSeconds).toBe(6);
  });

  it('omits invalid measurements and supports quiet-only recordings', () => {
    const timeline = buildTranscriptTimeline({ quietIntervals: [
      { start: NaN, end: 4 }, { start: -1, end: 2 }, { start: 5, end: 4 }, { start: 1, end: 3 },
    ] });
    expect(timeline).toEqual([{ start: 1, end: 3, kind: 'pause', text: 'Pause region (2.0 s quiet)' }]);
  });
});
