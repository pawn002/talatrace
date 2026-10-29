const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { nativePaths } = require('../../dist/electron/services/native-paths');

test('native paths distinguish CPU development/package layouts and keep Windows Vulkan selection', () => {
  const base = path.resolve('native-fixture');
  for (const platform of ['linux', 'win32']) for (const packaged of [false, true]) {
    const result = nativePaths(base, packaged, platform, () => false);
    const windows = platform === 'win32';
    assert.equal(result.whisperPath, path.join(base, 'whisper.cpp', packaged ? 'build' : 'build-baseline', 'bin', ...(windows ? ['Release'] : []), windows ? 'whisper-cli.exe' : 'whisper-cli'));
    assert.equal(result.backend, 'CPU');
    assert.equal(result.ffmpegPath, path.join(base, 'ffmpeg/bin', windows ? 'ffmpeg.exe' : 'ffmpeg'));
  }
  assert.equal(nativePaths(base, true, 'win32', () => true).backend, 'Vulkan');
  assert.equal(nativePaths(base, true, 'linux', () => true).backend, 'CPU');
});
