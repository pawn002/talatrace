const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { TranscriptExporter, exportPath } = require('../../dist/electron/services/transcript-export');

test('export uses the chosen format despite GTK missing/wrong suffixes and remembers the last successful folder/name', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'talatrace-export-'));
  const destination = path.join(root, 'chosen'); await fs.mkdir(destination);
  const calls = []; let file, canceled = false, replace = false;
  const exporter = new TranscriptExporter({ directory: () => root, choose: async options => { calls.push(options); return { canceled, filePath: file }; }, confirmOverwrite: async () => replace });
  const data = { text: 'Hello.', timestampedText: 'Timing context: Hello.', segments: [{ start: 1.25, end: 2.5, text: 'Hello.' }] };
  try {
    file = path.join(destination, 'answer.txt');
    const srt = await exporter.save(data, 'srt');
    assert.equal(calls[0].defaultPath, path.join(root, 'transcript.srt'));
    assert.deepEqual(calls[0].filters, [{ name: 'SRT subtitles', extensions: ['srt'] }]);
    assert.equal(srt, path.join(destination, 'answer.srt'));
    assert.match(await fs.readFile(srt, 'utf8'), /00:00:01,250 --> 00:00:02,500/);
    file = path.join(destination, 'answer');
    const json = await exporter.save(data, 'json');
    assert.equal(calls[1].defaultPath, path.join(destination, 'answer.json'));
    assert.deepEqual(JSON.parse(await fs.readFile(json, 'utf8')), data);
    const txt = await exporter.save(data, 'txt'); assert.equal(await fs.readFile(txt, 'utf8'), data.timestampedText);
    const vtt = await exporter.save(data, 'vtt'); assert.match(await fs.readFile(vtt, 'utf8'), /^WEBVTT\n\n00:00:01\.250 --> 00:00:02\.500/);
    await fs.writeFile(vtt, 'keep-existing');
    assert.equal(await exporter.save(data, 'vtt'), null); assert.equal(await fs.readFile(vtt, 'utf8'), 'keep-existing');
    replace = true; await exporter.save(data, 'vtt'); assert.match(await fs.readFile(vtt, 'utf8'), /^WEBVTT/);
    canceled = true; file = path.join(root, 'canceled.json'); assert.equal(await exporter.save(data, 'json'), null);
    assert.equal(calls.at(-1).defaultPath, path.join(destination, 'answer.json'));
    await assert.rejects(exporter.save(data, '../bad'), /Unsupported/);
    assert.equal(exportPath(path.join(root, 'answer.v1'), 'srt'), path.join(root, 'answer.v1.srt'));
    assert.equal(exportPath(path.join(root, 'answer.SRT'), 'srt'), path.join(root, 'answer.SRT'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
