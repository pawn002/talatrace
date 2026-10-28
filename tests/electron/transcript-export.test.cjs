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
    assert.equal(calls[0].title, 'Save transcript');
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

test('Linux confirms only the final destination, including exact names, and preserves both files on cancel', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'talatrace-linux-export-'));
  const selected = path.join(root, 'answer.srt');
  const destination = path.join(root, 'answer.json');
  const prompts = []; let replace = false; let chosen = selected;
  const exporter = new TranscriptExporter({ directory: () => root,
    choose: async options => { assert.deepEqual(options.properties, []); return { canceled: false, filePath: chosen }; },
    confirmOverwrite: async file => { prompts.push(file); return replace; },
  }, 'linux');
  try {
    await fs.writeFile(selected, 'original subtitles'); await fs.writeFile(destination, 'original JSON');
    assert.equal(await exporter.save({ text: 'New' }, 'json'), null);
    assert.deepEqual(prompts, [destination]);
    assert.equal(await fs.readFile(selected, 'utf8'), 'original subtitles');
    assert.equal(await fs.readFile(destination, 'utf8'), 'original JSON');
    replace = true;
    assert.equal(await exporter.save({ text: 'New' }, 'json'), destination);
    assert.deepEqual(JSON.parse(await fs.readFile(destination, 'utf8')), { text: 'New' });
    chosen = destination; replace = false;
    assert.equal(await exporter.save({ text: 'Another' }, 'json'), null);
    assert.equal(prompts.length, 3);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
