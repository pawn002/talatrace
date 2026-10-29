const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { TranscriptExporter, exportPath, serializeTranscript } = require('../../dist/electron/services/transcript-export');
const data = { text: 'Hello.', timestampedText: 'Timing: Hello.', segments: [{ start: 1.25, end: 2.5, text: 'Hello.' }] };
test('explicit supported suffix chooses the format and unchanged destinations rely only on native confirmation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'talatrace-export-'));
  const calls = [], prompts = []; let selected = path.join(root, 'answer.srt');
  const exporter = new TranscriptExporter({ directory: () => root,
    choose: async options => { calls.push(options); return { canceled: false, filePath: selected }; },
    confirmOverwrite: async file => { prompts.push(file); return true; },
  });
  try {
    await fs.writeFile(selected, 'original SRT'); await exporter.save(data, 'json');
    assert.match(await fs.readFile(selected, 'utf8'), /00:00:01,250 --> 00:00:02,500/);
    assert.deepEqual(prompts, []); assert.equal(calls[0].title, 'Save transcript');
    assert.deepEqual(calls[0].properties, ['showOverwriteConfirmation']);
    selected = path.join(root, 'answer.JSON'); await exporter.save(data, 'srt');
    assert.deepEqual(JSON.parse(await fs.readFile(selected, 'utf8')), data);
    assert.equal(calls[1].defaultPath, path.join(root, 'answer.srt'));
    assert.equal(exportPath(path.join(root, 'answer.v1'), 'srt'), path.join(root, 'answer.v1.srt'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('missing extensions confirm the final destination once, preserve cancellation and reuse the successful folder/stem', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'talatrace-export-'));
  const folder = path.join(root, 'chosen'); await fs.mkdir(folder);
  const destination = path.join(folder, 'answer.json');
  const prompts = [], calls = []; let canceled = false, replace = false;
  const exporter = new TranscriptExporter({ directory: () => root,
    choose: async options => { calls.push(options); return { canceled, filePath: path.join(folder, 'answer') }; },
    confirmOverwrite: async file => { prompts.push(file); return replace; },
  });
  try {
    await fs.writeFile(destination, 'keep'); assert.equal(await exporter.save(data, 'json'), null);
    assert.equal(await fs.readFile(destination, 'utf8'), 'keep');
    replace = true; assert.equal(await exporter.save(data, 'json'), destination);
    assert.deepEqual(prompts, [destination, destination]);
    canceled = true; await exporter.save(data, 'vtt');
    assert.equal(calls.at(-1).defaultPath, path.join(folder, 'answer.vtt'));
    await assert.rejects(exporter.save(data, ''), /Unsupported/);
    await assert.rejects(exporter.save({ text: '', segments: [] }, 'srt'), /No speech text/);
    await assert.rejects(exporter.save({ text: '  ' }, 'vtt'), /No speech text/);
    assert.equal(serializeTranscript({ text: '' }, 'vtt'), 'WEBVTT\n\n');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
