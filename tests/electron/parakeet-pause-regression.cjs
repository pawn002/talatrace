// Gate a real native boundary-control evaluation. Run after the documented corpus command.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const file = process.argv[2];
if (!file) throw new Error('Usage: node tests/electron/parakeet-pause-regression.cjs <results.json>');
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.ok(report.completedAt, 'Evaluation did not finish');
for (const condition of ['boundary-pause-1s', 'boundary-pause-30s']) {
  const row = report.runs.find(row => row.model === 'parakeet-tdt-0.6b-v3' && row.condition === condition);
  assert.ok(row, 'Missing native control: ' + condition);
  assert.equal(row.error, undefined);
  assert.equal(row.score.distance, 0, condition + ': recognition lost or changed reference words');
  const fixture = report.corpus.items.find(item => item.id === row.id);
  const continuation = row.segments.filter(segment => segment.start >= fixture.pauseEnd - .3).map(segment => segment.text).join(' ').trim();
  assert.match(continuation, /Each will therefore serve about equally well during the earlier stages of social growth[.?!]?/i,
    condition + ': continuation is missing or timestamps were not restored');
  if (condition === 'boundary-pause-30s') assert.ok(row.noSpeechIntervals.some(gap => gap.start <= (fixture.pauseStart + fixture.pauseEnd) / 2 &&
    gap.end >= (fixture.pauseStart + fixture.pauseEnd) / 2), 'Original pause metadata was lost');
  assert.equal(row.recognitionChunks[0].start, 0);
  for (let i = 1; i < row.recognitionChunks.length; i++) assert.equal(row.recognitionChunks[i].start, row.recognitionChunks[i-1].end);
  assert.ok(Math.abs(row.recognitionChunks.at(-1).end - row.duration) < 1/16000 + .000001, 'Chunk timeline does not cover all audio');
}
console.log('PASS: native Parakeet preserves both utterances, original pauses and global token timing.');
