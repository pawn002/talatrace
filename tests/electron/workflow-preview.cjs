// Offscreen visual review of the real built Angular app with local fixture IPC.
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const output = path.join(os.tmpdir(), 'whisper-visual-review', process.env.WHISPER_VISUAL_PASS || 'current');
const profile = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'whisper-visual-profile-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
nativeTheme.themeSource = 'dark';
const fixture = {
  text: 'I needed time to consider the tradeoffs. Then I made a decision.', timingMethod: 'whisper-dtw',
  segments: [{ start: 1.2, end: 5.1, text: 'I needed time to consider the tradeoffs.' }, { start: 35.5, end: 38.1, text: 'Then I made a decision.' }],
  noSpeechIntervals: [{ start: 5.5, end: 35.2 }], quietIntervals: [{ start: 7, end: 32 }],
};
ipcMain.handle('get-available-models', () => [{ name: 'base', size: '74 MB', installed: true }]);
ipcMain.handle('get-system-info', () => ({ platform: process.platform, version: '1.1.5' }));
let history = [];
ipcMain.handle('get-transcription-history', () => history);
let filename = 'interview-answer.wav';
ipcMain.handle('select-audio-file', () => ({ path: `C:/Audio/${filename}`, size: 5 * 1024 * 1024 }));
let failNext = false;
function transcribe(event) {
  const fail = failNext;
  failNext = false;
  setTimeout(() => {
    if (!event.sender.isDestroyed()) event.sender.send(fail ? 'transcription-error' : 'transcription-completed', fail ? 'Could not load the speech model.' : fixture);
  }, 1000);
  return { success: true, data: { id: 'visual-fixture' } };
}
ipcMain.handle('transcribe-recording', transcribe);
ipcMain.handle('transcribe-audio', transcribe);
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('Visual review timed out'); app.exit(1); }, 60000);
  const win = new BrowserWindow({ width: 1100, height: 820, show: false, webPreferences: {
    offscreen: true, preload: path.join(root, 'dist/electron/preload.js'),
  } });
  const metrics = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const click = async selector => {
    const point = await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({ block: 'nearest' });
      const rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  };
  const waitForRecording = async () => {
    for (let i = 0; i < 100; i++) {
      if (await win.webContents.executeJavaScript("!document.querySelector('[data-action=stop]').disabled")) return;
      await wait(20);
    }
    throw new Error('Preview recording did not start');
  };
  async function capture(name) {
    await wait(150);
    await fs.writeFile(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    metrics.push(await win.webContents.executeJavaScript(`(() => {
      const panel = document.querySelector('.app-container');
      const controls = [...document.querySelectorAll('.workflow-controls button')];
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const rgba = value => { context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
      const blend = (front, back) => front.slice(0, 3).map((v, i) => v * front[3] / 255 + back[i] * (1 - front[3] / 255));
      const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const contrasts = {};
      const smallText = [...document.querySelectorAll('body *')].filter(el => {
        if (el.matches('i, svg, svg *, script, style')) return false;
        if (![...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) return false;
        const style = getComputedStyle(el);
        return el.getClientRects().length && style.visibility !== 'hidden' && parseFloat(style.fontSize) < 14;
      }).map(el => ({ text: el.textContent.trim().slice(0, 80), size: getComputedStyle(el).fontSize }));
      if (smallText.length) throw new Error('Readable text below 14px: ' + JSON.stringify(smallText));
      const colourPairs = [];
      for (const selector of ['.workflow-number', '.tabs__tab[aria-selected=true]', '.copy-option', '.record-hint', '.segment__time', '.segment__text', '.record-error', '.status-text', '.badge', '.table-host th', '.table-host td', '.button:not(:disabled)', '.input', '.alert__message', '.toast__message', '.local-badge']) {
        for (const el of document.querySelectorAll(selector)) {
          if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
          const style = getComputedStyle(el);
          let background = 'white';
          for (let parent = el; parent; parent = parent.parentElement) {
            const fill = getComputedStyle(parent).backgroundColor;
            if (rgba(fill)[3] === 255) { background = fill; break; }
          }
          colourPairs.push({ selector, foreground: style.color, background, size: parseFloat(style.fontSize), weight: parseInt(style.fontWeight), text: el.textContent.trim().slice(0, 80) });
        }
      }
      for (const selector of ['.input', '.button:focus-visible', '.status-text i', '.local-badge--recording i']) {
        for (const el of document.querySelectorAll(selector)) {
          if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
          const style = getComputedStyle(el);
          let parent = el.parentElement;
          let background = 'white';
          for (; parent; parent = parent.parentElement) {
            const fill = getComputedStyle(parent).backgroundColor;
            if (rgba(fill)[3] === 255) { background = fill; break; }
          }
          colourPairs.push({ selector, foreground: el.matches('i') ? style.color : el.matches(':focus-visible') ? style.outlineColor : style.borderTopColor, background, nonText: true });
        }
      }
      for (const selector of ['.workflow-status h3', '#workflow-help', '.segment__time', '.segment__text', '.workflow-controls .button--primary']) {
        const el = document.querySelector(selector); if (!el) continue;
        const chain = []; for (let parent = el; parent; parent = parent.parentElement) chain.unshift(parent);
        const background = chain.reduce((back, item) => blend(rgba(getComputedStyle(item).backgroundColor), back), [255, 255, 255]);
        const foreground = blend(rgba(getComputedStyle(el).color), background);
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        contrasts[selector] = Math.round((values[0] + .05) / (values[1] + .05) * 100) / 100;
      }
      return { name: ${JSON.stringify(name)}, width: innerWidth, height: innerHeight,
        horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
        contrasts, colourPairs, smallText,
        controls: controls.map(el => ({ label: el.textContent.trim(), disabled: el.disabled,
          x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y),
          width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height) })) };
    })()`));
  }
  try {
    await fs.mkdir(output, { recursive: true });
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
    await win.loadFile(path.join(root, 'frontend/dist/index.html'));
    await wait(600);
    // Attach after the renderer exists. Offscreen windows have no OS focus;
    // renderer emulation lets trusted keys exercise real :focus-visible rules.
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await win.webContents.executeJavaScript(`(() => {
      const realNow = performance.now.bind(performance); let offset = 0;
      Object.defineProperty(performance, 'now', { value: () => realNow() + offset });
      window.advancePreviewClock = () => { offset += 38000; };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });
      const track = () => ({ stop() {}, onended: null });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
        await new Promise(resolve => setTimeout(resolve, 400));
        const tracks = [track()]; return { getTracks: () => tracks, getAudioTracks: () => tracks };
      } });
      window.MediaRecorder = class {
        static isTypeSupported() { return true; }
        mimeType = 'audio/webm'; state = 'inactive';
        start() { this.state = 'recording'; }
        stop() { this.state = 'inactive'; queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob(['local visual fixture']) }); this.onstop?.();
        }); }
      };
    })()`);
    await capture('ready');
    win.setSize(1024, 680); await capture('ready-short'); win.setSize(1100, 820);
    await click('[data-action="record"]'); await capture('starting'); await waitForRecording();
    await win.webContents.executeJavaScript('window.advancePreviewClock()'); await wait(300);
    await capture('recording');
    await win.webContents.executeJavaScript(`(() => {
      if (!document.querySelector('#app-tab-models').disabled || !document.querySelector('#app-tab-history').disabled) throw new Error('Active recording can be hidden by main navigation');
      document.querySelector('#app-tab-transcription').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      if (document.querySelector('#app-panel-transcription').hidden) throw new Error('Keyboard navigation hid an active recording');
      if (!document.querySelector('.local-badge').textContent.includes('Recording')) throw new Error('Header recording status is missing');
    })()`);
    await click('[data-action="stop"]'); await capture('processing');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    if (await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('.status-spinner')).animationName") !== 'none') throw new Error('Reduced motion preference was ignored');
    await capture('processing-reduced-motion');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    await wait(1000);
    await capture('result');
    await click('[data-action="copy"]'); await capture('copied');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await win.webContents.executeJavaScript("document.querySelector('[data-action=copy]').focus()");
    if (!await win.webContents.executeJavaScript("document.querySelector('[data-action=copy]').matches(':focus-visible')")) throw new Error('Keyboard focus ring is not visible');
    await capture('keyboard-focus');
    await win.webContents.executeJavaScript("navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); }; void 0");
    await click('[data-action="copy"]'); await capture('copy-error');
    await win.webContents.executeJavaScript('navigator.clipboard.writeText = async () => {}; void 0');
    await click('[data-action="copy"]');
    win.setSize(480, 820); await capture('result-narrow');
    win.setSize(360, 780); await capture('result-small');
    win.setSize(1100, 820);
    await win.webContents.executeJavaScript("document.querySelector('.settings-details').open = true");
    await capture('settings');
    await win.webContents.executeJavaScript("document.querySelector('#model-select').classList.add('input--error'); document.querySelector('#model-select').focus()");
    await capture('input-error-focus');
    await win.webContents.executeJavaScript("document.querySelector('#model-select').classList.remove('input--error')");
    win.setSize(360, 780);
    await win.webContents.executeJavaScript("document.querySelector('.settings-details').scrollIntoView({ block: 'end' })");
    await capture('settings-small');
    win.setSize(1100, 820);
    await win.webContents.executeJavaScript("document.querySelector('.app-container').scrollTop = 0");
    await win.webContents.executeJavaScript("document.querySelector('.settings-details').open = false");
    await click('[data-action="record"]'); await capture('starting-again'); await waitForRecording(); failNext = true;
    await win.webContents.executeJavaScript('window.advancePreviewClock()'); await wait(300);
    await click('[data-action="stop"]'); await wait(1100); await capture('retry');
    await click('#audio-file-tab'); await capture('audio-file');
    await click('[data-action="choose-file"]'); await wait(100); await capture('file-selected');
    filename = 'Research-interview-session-about-complex-decisions-and-unclear-expectations-with-detailed-follow-up-notes-2026-10-24.wav';
    await click('[data-action="choose-file"]'); await wait(100);
    win.setSize(360, 780); await capture('file-long-name'); win.setSize(1100, 820);
    await click('[data-action="transcribe"]'); await capture('file-processing'); await wait(1000);
    await capture('file-result');
    await click('#record-audio-tab');
    await click('[data-action="transcribe"]'); await wait(1100);
    nativeTheme.themeSource = 'light'; await wait(200); await capture('result-light');
    await win.webContents.executeJavaScript("document.querySelector('.settings-details').open = true; document.querySelector('#model-select').classList.add('input--error'); document.querySelector('#model-select').focus(); document.querySelector('#model-select').scrollIntoView({ block: 'center' })");
    await capture('input-error-focus-light');
    await win.webContents.executeJavaScript("document.querySelector('#model-select').classList.remove('input--error'); document.querySelector('.settings-details').open = false; document.querySelector('.app-container').scrollTop = 0");
    nativeTheme.themeSource = 'dark'; await wait(350);
    win.webContents.setZoomFactor(2); await wait(200); await capture('result-zoom');
    win.webContents.setZoomFactor(1);
    await win.webContents.executeJavaScript(`(() => {
      const first = document.querySelector('#app-tab-transcription'); first.focus();
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      const last = document.querySelector('#app-tab-history');
      if (document.activeElement !== last || last.getAttribute('aria-selected') !== 'true') throw new Error('Main navigation keyboard focus failed');
      last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      if (document.activeElement !== first) throw new Error('Main navigation Home failed');
    })()`);
    await click('#app-tab-models'); await capture('models');
    nativeTheme.themeSource = 'light'; await wait(350); await capture('models-light');
    nativeTheme.themeSource = 'dark'; await wait(350);
    win.setSize(360, 780); await capture('models-small'); win.setSize(1100, 820);
    await click('#app-tab-history'); await capture('history');
    history = [{ id: 'fixture', status: 'completed', fileName: 'Recorded answer', options: { model: 'base' }, audioDuration: 38.6, transcriptionTime: 1450, startedAt: '2026-10-24T21:30:00.000Z', result: fixture }];
    await click('#app-panel-history [aria-label="Refresh history"]'); await wait(100); await capture('history-populated');
    nativeTheme.themeSource = 'light'; await wait(350); await capture('history-light');
    nativeTheme.themeSource = 'dark'; await wait(350);
    win.setSize(360, 780); await capture('history-small');
    await fs.writeFile(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.log('Visual review:', output);
    clearTimeout(watchdog);
    app.quit();
  } catch (error) { clearTimeout(watchdog); console.error(error); app.exit(1); }
});
app.on('will-quit', () => { void fs.rm(profile, { recursive: true, force: true }).catch(() => {}); });
