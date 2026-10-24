const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSpeechActivity } = require('../../dist/electron/services/speech-activity');

test('converts native centiseconds and retains leading, internal and trailing speech gaps', () => {
  const result = parseSpeechActivity('Detected 2 speech segments:\nSpeech segment 0: start = 200.00, end = 600.00\nSpeech segment 1: start = 3600.00, end = 4000.00', 43);
  assert.deepEqual(result.speechIntervals, [{ start: 2, end: 6 }, { start: 36, end: 40 }]);
  assert.deepEqual(result.noSpeechIntervals, [{ start: 0, end: 2 }, { start: 6, end: 36 }, { start: 40, end: 43 }]);
});

test('does not bridge brief detected speech or report sub-1.5-second gaps', () => {
  const result = parseSpeechActivity('Detected 3 speech segments:\nSpeech segment 0: start = 0.00, end = 600.00\nSpeech segment 1: start = 1600.00, end = 1630.00\nSpeech segment 2: start = 3000.00, end = 3100.00', 32);
  assert.deepEqual(result.noSpeechIntervals, [{ start: 6, end: 16 }, { start: 16.3, end: 30 }]);
});

test('distinguishes no detected speech from missing or malformed output', () => {
  assert.deepEqual(parseSpeechActivity('Detected 0 speech segments:', 30), {
    speechIntervals: [], noSpeechIntervals: [{ start: 0, end: 30 }],
  });
  for (const output of ['', 'Detected 1 speech segments:',
    'Detected 1 speech segments:\nSpeech segment 0: start = 300.00, end = 200.00',
    'Detected 1 speech segments:\nSpeech segment 0: start = 0.00, end = 9000.00']) {
    assert.throws(() => parseSpeechActivity(output, 30));
  }
  assert.throws(() => parseSpeechActivity('Detected 0 speech segments:', NaN));
});
