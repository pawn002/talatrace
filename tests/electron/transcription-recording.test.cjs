const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TranscriptionService } = require('../../dist/electron/services/transcription.service');

function harness(transcribe) {
  const events = [];
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  // Inject a fake local engine; avoid Electron startup and real model downloads.
  const service = Object.create(TranscriptionService.prototype);
  Object.assign(service, {
    jobs: new Map(), transcriptionHistory: [], busy: false,
    whisperService: { getAudioDuration: async () => 20, transcribe },
    mainWindow: { isDestroyed: () => false, webContents: { send: (channel, payload) => {
      events.push([channel, payload]);
      if (channel === 'transcription-completed' || channel === 'transcription-error') finish();
    } } },
  });
  return { service, events, done };
}

test('recording job uses structured local timestamps and cleans up before publishing success', async () => {
  let cleaned = false;
  const h = harness(async (audio, options) => {
    assert.equal(options.timestamps, true);
    assert.equal(options.outputFormat, 'json');
    assert.equal(audio, '/temporary/interview.webm');
    return { text: 'Answer', segments: [{ start: 2, end: 5, text: 'Answer' }] };
  });
  await h.service.processAudio('/temporary/interview.webm', { model: 'base' }, async () => { cleaned = true; });
  await assert.rejects(h.service.processAudio('/other.wav', { model: 'base' }), /wait/);
  await h.done;
  assert.equal(cleaned, true);
  assert.equal(h.service.busy, false);
  assert.equal(h.events.at(-1)[0], 'transcription-completed');
  assert.equal(h.events.at(-1)[1].segments[0].start, 2);
});

test('failed transcription also cleans up temporary audio and releases the job lock', async () => {
  let cleaned = false;
  const h = harness(async () => { throw new Error('Model unavailable'); });
  await h.service.processAudio('/temporary/interview.webm', { model: 'base' }, async () => { cleaned = true; });
  await h.done;
  assert.equal(cleaned, true);
  assert.equal(h.service.busy, false);
  assert.deepEqual(h.events.at(-1), ['transcription-error', 'Model unavailable']);
});

test('recording carries independent speech and quiet measurements without deleting recognition text', async () => {
  const h = harness(async () => ({ text: 'Possible recognition artifact', segments: [{ start: 10, end: 11, text: 'Possible recognition artifact' }] }));
  h.service.whisperService.detectQuietIntervals = async () => [{ start: 12, end: 14 }];
  h.service.whisperService.detectSpeechActivity = async () => ({
    speechIntervals: [], noSpeechIntervals: [{ start: 0, end: 20 }], speechDetectionMethod: 'silero-v5.1.2',
  });
  await h.service.processAudio('/temporary/interview.webm', { model: 'base', detectQuietIntervals: true });
  await h.done;
  const result = h.events.at(-1)[1];
  assert.equal(result.text, 'Possible recognition artifact');
  assert.deepEqual(result.noSpeechIntervals, [{ start: 0, end: 20 }]);
  assert.deepEqual(result.quietIntervals, [{ start: 12, end: 14 }]);
});

test('speech detector failure still publishes the transcript with an explicit fallback warning', async () => {
  const h = harness(async () => ({ text: 'Answer' }));
  h.service.whisperService.detectQuietIntervals = async () => [];
  h.service.whisperService.detectSpeechActivity = async () => { throw new Error('Model unavailable'); };
  await h.service.processAudio('/temporary/interview.webm', { model: 'base', detectQuietIntervals: true });
  await h.done;
  assert.equal(h.events.at(-1)[0], 'transcription-completed');
  const result = h.events.at(-1)[1];
  assert.equal(result.text, 'Answer');
  assert.equal(result.noSpeechIntervals, undefined);
  assert.match(result.speechDetectionWarning, /Speech detection unavailable/);
});
