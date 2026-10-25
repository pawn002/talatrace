// Run with Electron, not node. Uses bundled sample audio as a fake microphone.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const profile = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'whisper-interview-smoke-'));
const fixture = path.join(profile, 'answer-with-pause.wav');
const fixtureProcess = require('node:child_process').spawnSync(path.join(root, 'ffmpeg/bin/ffmpeg.exe'), [
  '-i', path.join(root, 'whisper.cpp/samples/jfk.wav'),
  '-filter_complex', '[0:a]atrim=0:3,asetpts=PTS-STARTPTS[a];anullsrc=r=16000:cl=mono:d=30[s];[0:a]atrim=3:6,asetpts=PTS-STARTPTS[b];anullsrc=r=16000:cl=mono:d=7[tail];[a][s][b][tail]concat=n=4:v=0:a=1[out]',
  '-map', '[out]', '-c:a', 'pcm_s16le', fixture,
], { windowsHide: true });
if (fixtureProcess.status !== 0) throw new Error('Could not create sample audio with a known thirty-second pause');
app.setAppPath(root);
app.setPath('userData', profile);
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-file-for-fake-audio-capture', fixture);
// Exercise the packaged file:// loading path without starting the Angular dev server.
const devModule = require.resolve('electron-is-dev', { paths: [root] });
require.cache[devModule] = { id: devModule, filename: devModule, loaded: true, exports: false };
require(path.join(root, 'dist/electron/main.js'));
// Use a public local sample instead of opening a native file picker in this test.
ipcMain.removeHandler('select-audio-file');
ipcMain.handle('select-audio-file', async () => ({
  path: path.join(root, 'whisper.cpp/samples/jfk.wav'),
  size: (await fs.stat(path.join(root, 'whisper.cpp/samples/jfk.wav'))).size,
}));
let timeout;
app.whenReady().then(async () => {
  timeout = setTimeout(() => { console.error('SMOKE FAILED: timed out'); app.exit(1); }, 120000);
  const win = BrowserWindow.getAllWindows()[0];
  win.hide();
  win.webContents.setBackgroundThrottling(false);
  // Transcription must work without HTTP(S); model migration reads local files only.
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  try {
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await win.webContents.executeJavaScript(`window.__smokeModel = ${JSON.stringify(process.env.WHISPER_SMOKE_MODEL || 'base')}`);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      const button = text => [...document.querySelectorAll('.transcription-page button')].find(el => el.textContent.includes(text));
      const requirePrimary = text => {
        const actions = [...document.querySelectorAll('.transcription-page button.button--primary')];
        if (actions.length !== 1 || !actions[0].textContent.includes(text)) throw new Error('Unclear primary action: ' + actions.map(el => el.textContent).join('; '));
      };
      for (let i = 0; i < 200 && ![...document.querySelectorAll('#model-select option')].some(option => option.value === window.__smokeModel); i++) await wait(100);
      const modelSelect = document.querySelector('#model-select');
      if (![...modelSelect.options].some(option => option.value === window.__smokeModel)) throw new Error('Smoke model is not installed: ' + window.__smokeModel);
      modelSelect.value = window.__smokeModel;
      modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(100);
      requirePrimary('Record answer');
      let stableControls = [...document.querySelectorAll('.workflow-controls button')];
      const assertStable = () => {
        const current = [...document.querySelectorAll('.workflow-controls button')];
        if (current.length !== 3 || current.some((node, index) => node !== stableControls[index])) throw new Error('Workflow controls were replaced or moved');
      };
      if (!button('Copy transcript')?.disabled || !button('Stop & transcribe')?.disabled) throw new Error('Unavailable actions must remain visible and disabled');
      const clipboardPermission = await navigator.permissions.query({ name: 'clipboard-write' });
      if (clipboardPermission.state === 'denied') throw new Error('App permission policy blocks Copy');
      let copied = '';
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { copied = text; } }, configurable: true });
      document.querySelector('[data-action=record]').click();
      for (let i = 0; i < 100 && button('Stop & transcribe')?.disabled; i++) await wait(100);
      if (button('Stop & transcribe')?.disabled) throw new Error(document.querySelector('.record-error')?.textContent || 'Recording did not start');
      requirePrimary('Stop & transcribe');
      assertStable();
      await wait(1000);
      if (document.querySelector('.spectrum-display')?.getAttribute('data-mode') !== 'spectrogram') throw new Error('Recorded microphone stream is not being analyzed');
      const spectrum = document.querySelector('app-audio-spectrum canvas');
      if (!spectrum.getContext('2d').getImageData(0, 0, spectrum.width, spectrum.height).data.some((value, index) => index % 4 === 3 && value > 0)) throw new Error('Real microphone audio produced no spectrum');
      if (document.querySelector('#app-tab-models').disabled || document.querySelector('#app-tab-history').disabled) throw new Error('Main views unnecessarily locked during recording');
      document.querySelector('#app-tab-history').click(); await wait(100);
      if (document.querySelector('#app-panel-history').hidden) throw new Error('Cannot inspect History during recording');
      document.querySelector('#app-tab-transcription').click(); await wait(100);
      if (document.querySelector('[data-action=stop]').disabled || !document.querySelector('.local-badge').textContent.includes('Recording')) throw new Error('Navigating interrupted recording');
      await wait(38000);
      const liveDuration = document.querySelector('[role="timer"]').textContent;
      if (!/^\\d{2}:\\d{2}$/.test(liveDuration)) throw new Error('Live duration should show whole seconds: ' + liveDuration);
      button('Stop & transcribe').click();
      await wait(100);
      assertStable();
      if (stableControls.some(button => !button.disabled)) throw new Error('Record, Stop and Copy must remain disabled while processing');
      const finalDuration = document.querySelector('[role="timer"]').textContent;
      if (document.querySelector('.spectrum-display')?.getAttribute('data-mode') !== 'idle') throw new Error('Spectrum kept running after microphone stop');
      if (!/^\\d{2}:\\d{2}\\.\\d{3}$/.test(finalDuration)) throw new Error('Stopped duration should include milliseconds: ' + finalDuration);
      for (let i = 0; i < 900 && !document.querySelector('.result-section'); i++) {
        await wait(100);
        const error = document.querySelector('.record-error')?.textContent;
        if (error) throw new Error(error);
      }
      const segment = document.querySelector('.segment__time')?.textContent;
      if (!segment) throw new Error('No timestamped speech returned');
      const performanceSummary = document.querySelector('.performance-summary')?.textContent;
      if (!performanceSummary?.includes('s audio') || !performanceSummary.includes('s processing')) throw new Error('Recording result omitted performance measurements');
      const latest = (await window.electronAPI.getTranscriptionHistory())[0];
      if (!(latest.audioDuration > 37 && latest.audioDuration < 43)) throw new Error('History omitted the full recording duration: ' + latest.audioDuration);
      if (latest.result.duration !== latest.audioDuration || latest.result.processingTimeMs !== latest.transcriptionTime) throw new Error('Result and history disagree about performance');
      requirePrimary('Copy transcript');
      assertStable();
      if (document.querySelector('[role="timer"]').textContent !== finalDuration) throw new Error('Final duration changed during processing');
      button('Copy transcript').click();
      await wait(100);
      requirePrimary('Copy transcript');
      if (!document.querySelector('.workflow-panel').textContent.includes('Copied — ready to paste')) throw new Error('Copy confirmation was not visible');
      if (!/^\\[\\d{2}:\\d{2}:\\d{2}\\.\\d{3} →/m.test(copied)) throw new Error('Copy omitted timestamps: ' + copied);
      if (!copied.includes('No speech detected (')) throw new Error('Known speech gap was not preserved in Copy: ' + copied);
      if (!copied.includes('audio-aligned token locations')) throw new Error('Audio alignment was not used: ' + copied);
      const speechRows = [...document.querySelectorAll('.transcript-view .transcript-segment:not(.transcript-segment--pause)')];
      const speechTimes = speechRows.map(row => row.querySelector('.segment__time').textContent);
      if (!speechTimes.some(time => /^\\[00:00:3[3-6]\\./.test(time))) throw new Error('Resumed speech was not aligned to the known audio location: ' + speechTimes.join('; '));
      if (speechTimes.some(time => /^\\[00:00:(?:0[4-9]|[12][0-9]|3[0-2])\\./.test(time))) throw new Error('A speech entry starts inside the known thirty-second silence: ' + speechRows.map(row => row.textContent).join('; '));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      const visibleText = document.querySelector('.result-section').textContent;
      document.querySelector('#audio-file-tab').click();
      await wait(100);
      requirePrimary('Choose audio file');
      if (button('Record answer') || button('Stop & transcribe')) throw new Error('Recording controls leaked into the file subtab');
      if (document.querySelector('.result-section')) throw new Error('Recording transcript leaked into the file subtab');
      button('Choose audio file').click();
      for (let i = 0; i < 100 && document.querySelector('.file-name')?.textContent === 'No file selected'; i++) await wait(100);
      if (!document.querySelector('[data-action=choose-file]').closest('.step-card').querySelector('.file-info')) throw new Error('Selected file is detached from the Choose step');
      requirePrimary('Transcribe file');
      button('Transcribe file').click();
      await wait(100);
      for (let i = 0; i < 300 && !document.querySelector('.result-section'); i++) await wait(100);
      requirePrimary('Copy transcript');
      if (!document.querySelector('.result-section')?.textContent.includes('fellow')) throw new Error('File transcription did not complete');
      document.querySelector('#record-audio-tab').click();
      await wait(100);
      if (document.querySelector('.result-section')?.textContent !== visibleText) throw new Error('Switching subtabs lost the recorded transcript');
      if (document.querySelector('[role="timer"]').textContent !== finalDuration) throw new Error('Switching subtabs lost the recorded duration');
      stableControls = [...document.querySelectorAll('.workflow-controls button')];
      if (!button('Record another')) throw new Error('Completed recording does not offer another answer');
      button('Record another').click();
      for (let i = 0; i < 100 && button('Stop & transcribe')?.disabled; i++) await wait(100);
      requirePrimary('Stop & transcribe');
      if (document.querySelector('.result-section')) throw new Error('Previous transcript obscures the new recording');
      if (button('Discard recording')) throw new Error('Discard action is still exposed');
      button('Stop & transcribe').click();
      for (let i = 0; i < 300 && button('Copy transcript').disabled; i++) await wait(100);
      requirePrimary('Copy transcript');
      assertStable();
      return { segment, copied, liveDuration, finalDuration, visibleText };
    })()`);
    console.log('SMOKE PASSED (network disabled, fake microphone):', JSON.stringify(result));
    clearTimeout(timeout);
    app.quit();
  } catch (error) {
    clearTimeout(timeout);
    console.error('SMOKE FAILED:', error);
    app.exit(1);
  }
});
app.on('will-quit', () => { void fs.rm(profile, { recursive: true, force: true }).catch(() => {}); });
