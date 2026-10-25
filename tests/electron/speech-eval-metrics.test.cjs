const { test } = require('node:test');
const assert = require('node:assert/strict');
const { score, summarize } = require('../../scripts/speech-eval-metrics.cjs');
test('WER counts substitutions, deletions and insertions', () => {
  assert.equal(score('one two three', 'one too three').substitutions, 1);
  assert.equal(score('one two three', 'one three').deletions, 1);
  assert.equal(score('one two three', 'one extra two three').insertions, 1);
  assert.equal(score("DON’T stop!", 'dont stop').wer, 0);
  assert.equal(score('one two', '').wer, 1);
});
test('silence counts invented words without dividing by zero', () => {
  const result = score('', 'Thank you.');
  assert.equal(result.wer, null); assert.equal(result.insertions, 2);
});
test('corpus WER weights reference words rather than averaging clip percentages', () => {
  const result = summarize([
    { score: score('one', 'wrong'), duration: 1, processingMs: 500 },
    { score: score('one two three', 'one two three'), duration: 3, processingMs: 500 },
  ]);
  assert.equal(result.wer, .25); assert.equal(result.audioPerProcessing, 4);
});
