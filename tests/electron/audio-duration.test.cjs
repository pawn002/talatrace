const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { decodedAudioDuration } = require('../../dist/electron/services/audio-duration');
const { WhisperService } = require('../../dist/electron/services/whisper.service');

test('decoded duration uses the final microsecond timestamp and rejects missing/invalid values', () => {
  assert.equal(decodedAudioDuration('out_time_us=1000000\nprogress=continue\nout_time_us=39840000\nprogress=end\n'), 39.84);
  for (const output of ['', 'out_time_us=N/A', 'out_time_us=-1', 'out_time_us=0']) assert.equal(decodedAudioDuration(output), undefined);
});

const nativeRoot = path.resolve(__dirname, '../..');
const nativeFfmpeg = path.join(nativeRoot, 'ffmpeg/bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
test('duration is measured for a headerless live WebM recording, including trailing quiet audio', {
  skip: !existsSync(nativeFfmpeg) || !existsSync(path.join(nativeRoot, 'whisper.cpp/samples/jfk.wav')),
}, async () => {
  const root = path.resolve(__dirname, '../..');
  const ffmpeg = path.join(root, 'ffmpeg/bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'recording-duration-test-'));
  const recording = path.join(workspace, 'live.webm');
  try {
    const encoded = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', path.join(root, 'whisper.cpp/samples/jfk.wav'), '-af', 'apad=pad_dur=3', '-c:a', 'libopus', '-f', 'webm', '-live', '1', recording]);
    assert.equal(encoded.status, 0, encoded.stderr.toString());
    const header = spawnSync(ffmpeg, ['-hide_banner', '-i', recording]);
    assert.match(header.stderr.toString(), /Duration: N\/A/);
    const service = Object.create(WhisperService.prototype);
    Object.assign(service, { ffmpegAvailable: true, ffmpegPath: ffmpeg });
    const duration = await service.getAudioDuration(recording);
    assert.ok(duration > 13.9 && duration < 14.2, `Expected full audio plus trailing silence; got ${duration}`);
  } finally { await fs.rm(workspace, { recursive: true, force: true }); }
});
