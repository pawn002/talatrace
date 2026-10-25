const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chunkBoundaries, prepareParakeetChunks, parseParakeetChunks } = require('../../dist/electron/services/parakeet-chunks');

test('long gaps select partition points, including leading gaps, without making short-gap cuts', () => {
  const rate = 16000;
  assert.deepEqual(chunkBoundaries(40*rate, [{start:5,end:35}]), [0,20*rate,40*rate]);
  assert.deepEqual(chunkBoundaries(40*rate, [{start:0,end:30}]), [0,15*rate,40*rate]);
  assert.deepEqual(chunkBoundaries(40*rate, [{start:5,end:6}, {start:-1,end:10}, {start:30,end:50}, {start:NaN,end:10}]), [0,40*rate]);
  assert.deepEqual(chunkBoundaries(60*rate, [{start:0,end:60}]), [0,15*rate,30*rate,45*rate,60*rate]);
});

test('WAV partitions preserve every PCM byte, including sound inside detector-labelled gaps', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'parakeet-chunk-test-'));
  try {
    const pcm = Buffer.alloc(40*16000*2);
    for (let i = 0; i < pcm.length; i++) pcm[i] = i % 251;
    const header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(pcm.length+36,4); header.write('WAVEfmt ',8);
    header.writeUInt32LE(16,16); header.writeUInt16LE(1,20); header.writeUInt16LE(1,22);
    header.writeUInt32LE(16000,24); header.writeUInt32LE(32000,28); header.writeUInt16LE(2,32);
    header.writeUInt16LE(16,34); header.write('data',36); header.writeUInt32LE(pcm.length,40);
    const wav = path.join(directory,'source.wav'); await fs.writeFile(wav, Buffer.concat([header,pcm]));
    const chunks = await prepareParakeetChunks(wav,[{start:5,end:35}]);
    assert.equal(chunks.length,2);
    assert.deepEqual(chunks.map(({start,end})=>({start,end})),[{start:0,end:20},{start:20,end:40}]);
    const combined = Buffer.concat(await Promise.all(chunks.map(async chunk => (await fs.readFile(chunk.file)).subarray(44))));
    assert.deepEqual(combined,pcm);
    assert.equal((await prepareParakeetChunks(wav,[]))[0].file,wav);
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});

test('batch merging preserves words and translates token times onto the original audio timeline', () => {
  const chunks = [{file:path.resolve('first.wav'),start:0,end:20},{file:path.resolve('second.wav'),start:20,end:40}];
  const rows = chunks.map((chunk,i)=>({file:chunk.file,text:i?'Back again.':'First.',token_segments:[{text:i?'Back again.':'First.',t0_ms:1000,t1_ms:2000}]}));
  const result = parseParakeetChunks(rows.map(JSON.stringify).join('\n'),chunks);
  assert.equal(result.text,'First. Back again.');
  assert.deepEqual(result.segments.map(({start,end})=>({start,end})),[{start:1,end:2},{start:21,end:22}]);
  assert.throws(()=>parseParakeetChunks(JSON.stringify(rows[0]),chunks),/chunk count/);
  assert.throws(()=>parseParakeetChunks(rows.reverse().map(JSON.stringify).join('\n'),chunks),/out of order/);
});

test('bad timing or failed chunks never silently remove part of the recognition text', () => {
  const chunks = [{file:path.resolve('first.wav'),start:0,end:20},{file:path.resolve('second.wav'),start:20,end:40}];
  const rows = [{file:chunks[0].file,text:'First.'},{file:chunks[1].file,text:'Still preserved.'}];
  const result = parseParakeetChunks(rows.map(JSON.stringify).join('\n'),chunks);
  assert.equal(result.text,'First. Still preserved.'); assert.ok(result.alignmentWarning); assert.equal(result.segments,undefined);
  rows[1].error='failed';
  assert.throws(()=>parseParakeetChunks(rows.map(JSON.stringify).join('\n'),chunks),/failed/);
});
