const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { storeRecording, removeStaleRecordings } = require('../../dist/electron/services/recording-storage');

test('recordings have isolated workspaces and cleanup cannot delete another recording', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recording-test-'));
  try {
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
    const first = await storeRecording(bytes, root);
    const second = await storeRecording(bytes, root);
    assert.notEqual(first.audioPath, second.audioPath);
    assert.deepEqual(await fs.readFile(first.audioPath), Buffer.from(bytes));
    await first.cleanup();
    await assert.rejects(fs.access(first.audioPath));
    await fs.access(second.audioPath);
    await second.cleanup();
    assert.deepEqual(await fs.readdir(root), []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('rejects invalid or oversized payloads before writing anything', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recording-test-'));
  try {
    for (const bytes of [null, 'path/to/file', new Uint8Array(), new Uint8Array([1, 2, 3, 4]), new Uint8Array(64 * 1024 * 1024 + 1)]) {
      await assert.rejects(storeRecording(bytes, root));
    }
    assert.deepEqual(await fs.readdir(root), []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('stale cleanup removes only old app recording directories', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recording-test-'));
  try {
    const old = path.join(root, 'recording-old');
    const fresh = path.join(root, 'recording-fresh');
    const other = path.join(root, 'keep-me');
    for (const dir of [old, fresh, other]) await fs.mkdir(dir);
    const past = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await fs.utimes(old, past, past);
    await fs.utimes(other, past, past);
    await removeStaleRecordings(root);
    assert.deepEqual((await fs.readdir(root)).sort(), ['keep-me', 'recording-fresh']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
