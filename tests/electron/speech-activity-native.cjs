// Integration check using bundled native tools and public sample audio, no network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { parseSpeechActivity } = require('../../dist/electron/services/speech-activity');
const { parseQuietIntervals } = require('../../dist/electron/services/quiet-intervals');
const root = path.resolve(__dirname, '../..');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-vad-check-'));
const ffmpeg = path.join(root, 'ffmpeg/bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const { nativePaths } = require('../../dist/electron/services/native-paths');
const vad = path.join(nativePaths(root, false).whisperBinDir, process.platform === 'win32' ? 'whisper-vad-speech-segments.exe' : 'whisper-vad-speech-segments');
const model = path.join(root, 'models/ggml-silero-v5.1.2.bin');
function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result;
}
try {
  for (const interrupted of [false, true]) {
    const file = path.join(workspace, interrupted ? 'interrupted.wav' : 'noise-gap.wav');
    const noise = 'anoisesrc=r=16000:c=white:a=0.04:s=42';
    const filter = interrupted
      ? `[0:a]atrim=0:3,asetpts=PTS-STARTPTS[a];${noise}:d=12[n];[0:a]atrim=0:3,asetpts=PTS-STARTPTS[b];${noise}:d=15[m];[0:a]atrim=0:8,asetpts=PTS-STARTPTS[c];[a][n][b][m][c]concat=n=5:v=0:a=1[out]`
      : `[0:a]atrim=0:3,asetpts=PTS-STARTPTS[a];${noise}:d=30[n];[0:a]atrim=0:8,asetpts=PTS-STARTPTS[b];[a][n][b]concat=n=3:v=0:a=1[out]`;
    run(ffmpeg, ['-i', path.join(root, 'whisper.cpp/samples/jfk.wav'), '-filter_complex', filter, '-map', '[out]', '-c:a', 'pcm_s16le', file]);
    const result = parseSpeechActivity(run(vad, ['-vm', model, '-f', file, '-np']).stdout, 41);
    const quiet = parseQuietIntervals(run(ffmpeg, ['-i', file, '-af', 'silencedetect=noise=-35dB:d=1.5', '-f', 'null', '-']).stderr);
    assert.ok(result.speechIntervals.some(i => i.start >= 33 && i.end > 35), 'Missed resumed speech after noise');
    if (interrupted) {
      assert.ok(result.speechIntervals.some(i => i.start < 18 && i.end > 15), 'Missed the brief speech interruption');
      assert.ok(!result.noSpeechIntervals.some(i => i.start < 15 && i.end > 18), 'Bridged actual speech');
      assert.ok(result.noSpeechIntervals.filter(i => i.end - i.start > 10).length >= 2, 'Expected separate speech gaps');
    } else {
      assert.ok(result.noSpeechIntervals.some(i => i.start < 4 && i.end > 32 && i.end - i.start > 28), 'Missed speech gap in steady background noise');
      assert.ok(!quiet.some(i => i.end - i.start > 28), 'Noise fixture should defeat the volume-only detector');
    }
    console.log(JSON.stringify({ fixture: path.basename(file), ...result, quiet }));
  }
  console.log('NATIVE VAD PASSED: steady noise, long speech gap, and speech interruption');
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
