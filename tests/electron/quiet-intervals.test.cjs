const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseQuietIntervals } = require('../../dist/electron/services/quiet-intervals');

test('preserves quiet intervals on the original timeline including trailing silence', () => {
  assert.deepEqual(parseQuietIntervals(`
    [silencedetect] silence_start: -0.01
    [silencedetect] silence_end: 2.51 | silence_duration: 2.52
    unrelated FFmpeg logging
    [silencedetect] silence_start: 7.125
    [silencedetect] silence_end: 11.625 | silence_duration: 4.5
  `), [{ start: 0, end: 2.51 }, { start: 7.125, end: 11.625 }]);
});

test('does not invent intervals from missing boundaries or short gaps', () => {
  assert.deepEqual(parseQuietIntervals('silence_end: 3\nsilence_start: 5\nsilence_end: 5.2\nsilence_start: 9'), []);
});
