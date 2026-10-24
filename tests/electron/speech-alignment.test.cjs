const { test } = require('node:test');
const assert = require('node:assert/strict');
const { alignmentPreset, parseWhisperTranscript } = require('../../dist/electron/services/speech-alignment');

function transcript(tokens) {
  return { model: { multilingual: true }, transcription: [{
    text: ' First. Resumed speech.', offsets: { from: 0, to: 82000 }, tokens,
  }] };
}
const tokens = [
  { id: 50257, text: '[_BEG_]', t_dtw: -1 },
  { id: 1, text: ' First', t_dtw: 20 },
  { id: 2, text: '.', t_dtw: 120 },
  { id: 3, text: ' Resumed', t_dtw: 7580 },
  { id: 4, text: ' speech', t_dtw: 7640 },
  { id: 2, text: '.', t_dtw: 7670 },
  { id: 50363, text: '[_TT_4100]', t_dtw: -1 },
];

test('uses audio-based DTW locations across a long pause, not broad segment offsets', () => {
  const result = parseWhisperTranscript(transcript(tokens), true);
  assert.equal(result.timingMethod, 'whisper-dtw');
  assert.deepEqual(result.segments, [
    { start: 0.2, end: 0.2, text: ' First.' },
    { start: 75.8, end: 76.4, text: ' Resumed speech.' },
  ]);
  assert.deepEqual(result.originalSegments, [{ start: 0, end: 82, text: ' First. Resumed speech.' }]);
  assert.equal(result.text, ' First. Resumed speech.');
});

test('splits a long internal gap without changing recognized words', () => {
  const data = { transcription: [{ text: ' Hello again', offsets: { from: 0, to: 10000 }, tokens: [
    { id: 1, text: ' Hello', t_dtw: 50 }, { id: 2, text: ' again', t_dtw: 900 },
  ] }] };
  const result = parseWhisperTranscript(data, true);
  assert.deepEqual(result.segments.map(segment => segment.start), [0.5, 9]);
  assert.equal(result.segments.map(segment => segment.text).join(''), result.text);
});

test('missing, negative, non-monotonic, or incomplete alignment retains all original text and times', () => {
  for (const bad of [undefined, tokens.map(token => ({ ...token, t_dtw: -1 })),
    tokens.map(token => ({ ...token, t_dtw: token.id === 4 ? 1 : token.t_dtw })), tokens.slice(0, 3)]) {
    const result = parseWhisperTranscript(transcript(bad), true);
    assert.equal(result.timingMethod, 'whisper-segments');
    assert.match(result.alignmentWarning, /unavailable or inconsistent/);
    assert.deepEqual(result.segments, result.originalSegments);
    assert.equal(result.text, ' First. Resumed speech.');
  }
});

test('does not guess alignment heads for an unversioned large model', () => {
  assert.equal(alignmentPreset('base'), 'base');
  assert.equal(alignmentPreset('large'), undefined);
});

test('attaches punctuation aligned inside a pause without extending speech', () => {
  for (const punctuationTime of [1344, -1]) {
    const data = { transcription: [{ text: ' pause starting now.', offsets: { from: 9000, to: 14000 }, tokens: [
      { id: 1, text: ' pause', t_dtw: 984 },
      { id: 2, text: ' starting', t_dtw: 1050 },
      { id: 3, text: ' now', t_dtw: 1150 },
      { id: 4, text: '.', t_dtw: punctuationTime },
    ] }] };
    const result = parseWhisperTranscript(data, true);
    assert.equal(result.timingMethod, 'whisper-dtw');
    assert.deepEqual(result.segments, [{ start: 9.84, end: 11.5, text: ' pause starting now.' }]);
    assert.equal(result.segments.map(segment => segment.text).join(''), result.text);
  }
});

test('attaches a separate punctuation segment to the preceding speech', () => {
  const result = parseWhisperTranscript({ transcription: [
    { text: ' now', offsets: { from: 11000, to: 12000 }, tokens: [{ id: 1, text: ' now', t_dtw: 1150 }] },
    { text: '.', offsets: { from: 13000, to: 14000 }, tokens: [{ id: 2, text: '.', t_dtw: 1344 }] },
  ] }, true);
  assert.equal(result.timingMethod, 'whisper-dtw');
  assert.deepEqual(result.segments, [{ start: 11.5, end: 11.5, text: ' now.' }]);
  assert.equal(result.text, ' now.');
});
