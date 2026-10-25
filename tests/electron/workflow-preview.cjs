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
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.disableHardwareAcceleration();
nativeTheme.themeSource = 'dark';
const fixture = {
  text: 'I needed time to consider the tradeoffs. Then I made a decision.', timingMethod: 'whisper-dtw',
  duration: 38.52, processingTimeMs: 6420, modelName: 'Parakeet TDT 0.6B v3 · Q8',
  segments: [{ start: 1.2, end: 5.1, text: 'I needed time to consider the tradeoffs.' }, { start: 35.5, end: 38.1, text: 'Then I made a decision.' }],
  noSpeechIntervals: [{ start: 5.5, end: 35.2 }], quietIntervals: [{ start: 7, end: 32 }],
};
fixture.segments[0].text = 'I needed time to consider the tradeoffs. The deadline was fixed, but the requirements were still changing, so I wrote down the assumptions and asked the team to choose the risks they could accept. That gave us a shared starting point and made it easier to explain why I chose a smaller, testable first step instead of promising everything at once.';
fixture.text = fixture.segments.map(segment => segment.text).join(' ');
fixture.originalSegments = fixture.segments;
const { SPEECH_MODELS, modelSize } = require('../../dist/electron/services/model-catalog');
let alternateReady = true;
ipcMain.handle('get-available-models', () => SPEECH_MODELS.map(model => ({ ...model, size: modelSize(model.sizeBytes), installed: model.name === 'base', available: model.engine !== 'transcribe.cpp' || alternateReady, unavailableReason: 'Parakeet runtime is not included in this build.' })));
ipcMain.handle('download-model', () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 1500)));
ipcMain.handle('get-system-info', () => ({ platform: process.platform, version: '1.1.5' }));
let history = [];
ipcMain.handle('get-transcription-history', () => history);
let filename = 'interview-answer.wav';
let failPicker = false;
ipcMain.handle('select-audio-file', () => { if (failPicker) { failPicker = false; throw new Error('File picker unavailable'); } return { path: `C:/Audio/${filename}`, size: 5 * 1024 * 1024 }; });
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
    offscreen: true, backgroundThrottling: false, preload: path.join(root, 'dist/electron/preload.js'),
  } });
  const metrics = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const click = async selector => {
    const point = await win.webContents.executeJavaScript(`(() => {
      const el = ${JSON.stringify(selector)}.split(' >>> ').reduce((root, part, i) => (i ? root.shadowRoot : root).querySelector(part), document);
      el.scrollIntoView({ block: 'nearest' });
      const rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  };
    const chooseTheme = async value => {
      await win.webContents.executeJavaScript(`(() => {
        document.querySelector('#theme-control input[value=' + ${JSON.stringify(value)} + ']').click();
      })()`);
      await wait(250);
    };
  const waitForRecording = async () => {
    for (let i = 0; i < 100; i++) {
      if (await win.webContents.executeJavaScript("!document.querySelector('[data-action=stop]').disabled")) return;
      await wait(20);
    }
    throw new Error('Preview recording did not start');
  };
  async function capture(name) {
    await wait(250); // Let the 200ms control colour transitions settle before sampling.
    await fs.writeFile(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    metrics.push(await win.webContents.executeJavaScript(`(() => {
      const panel = document.querySelector('.app-container');
      const controls = [...document.querySelectorAll('.workflow-controls button')];
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const rgba = value => { context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
      const blend = (front, back) => front.slice(0, 3).map((v, i) => v * front[3] / 255 + back[i] * (1 - front[3] / 255));
      const resolvedBackground = el => {
        if (el.matches('.theme-choice') && rgba(getComputedStyle(el).backgroundColor)[3] === 0) return getComputedStyle(el.closest('.theme-track'), '::before').backgroundColor;
        const chain = []; for (let parent = el; parent; parent = parent.parentElement) chain.unshift(parent);
        const rgb = chain.reduce((back, item) => blend(rgba(getComputedStyle(item.localName === 'candor-card' ? item.shadowRoot.querySelector('.card') : item).backgroundColor), back), [255, 255, 255]);
        return 'rgb(' + rgb.map(Math.round).join(', ') + ')';
      };
      const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const contrasts = {};
      const deepElements = root => [...root.querySelectorAll('*')].flatMap(el => [el, ...(el.shadowRoot ? deepElements(el.shadowRoot) : [])]);
      const smallText = deepElements(document.body).filter(el => {
        if (el.matches('i, svg, svg *, script, style')) return false;
        if (![...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) return false;
        const style = getComputedStyle(el);
        return el.getClientRects().length && style.visibility !== 'hidden' && parseFloat(style.fontSize) < 14;
      }).map(el => ({ text: el.textContent.trim().slice(0, 80), size: getComputedStyle(el).fontSize }));
      if (smallText.length) throw new Error('Readable text below 14px: ' + JSON.stringify(smallText));
      const colourPairs = [];
      for (const selector of ['.theme-label', '.theme-choice', '.spectrum-label', '.spectrum-fallback', '.disclosure > summary', '.workflow-number', '.tabs__tab[aria-selected=true]', '.copy-option', '.record-hint', '.explanation-prose', '.segment__time', '.segment__text', '.record-error', '.status-text', '.badge', '.table-host th', '.table-host td', '.button:not(:disabled)', '.input', '.alert__message', '.toast__message', '.local-badge']) {
        for (const el of document.querySelectorAll(selector)) {
          if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
          const style = getComputedStyle(el);
          const background = resolvedBackground(el);
          colourPairs.push({ selector, foreground: style.color, background, size: parseFloat(style.fontSize), weight: parseInt(style.fontWeight), text: el.textContent.trim().slice(0, 80) });
        }
      }
      for (const selector of ['.input', '.button:focus-visible', '.status-text i', '.local-badge--recording i', '.workflow-connector', '.spectrum-display canvas']) {
        for (const el of document.querySelectorAll(selector)) {
          if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
          const style = getComputedStyle(el);
          let parent = el.matches('.workflow-connector') ? el.closest('.workflow-panel') : el.parentElement;
          const background = resolvedBackground(parent);
          colourPairs.push({ selector, foreground: el.matches('i, canvas') ? style.color : el.matches(':focus-visible') ? style.outlineColor : style.borderTopColor, background, nonText: true });
        }
      }
      for (const el of document.querySelectorAll('.theme-option input:checked + .theme-choice')) {
        colourPairs.push({ selector: 'theme selected border', foreground: getComputedStyle(el).borderTopColor, background: getComputedStyle(el.closest('.theme-track'), '::before').backgroundColor, nonText: true });
        if (el.previousElementSibling.matches(':focus-visible')) colourPairs.push({ selector: 'theme focus ring', foreground: getComputedStyle(el).outlineColor, background: resolvedBackground(document.querySelector('.app-header')), nonText: true });
      }
      for (const host of document.querySelectorAll('candor-tooltip, candor-toast, candor-disclosure, candor-accordion-item')) {
        for (const el of host.shadowRoot?.querySelectorAll('.tooltip__bubble, .toast__message, .disclosure__trigger, .accordion-item__title, .select') || []) {
          if (!host.checkVisibility() || !el.checkVisibility({ checkVisibilityCSS: true })) continue;
          const style = getComputedStyle(el);
          const box = el.closest('.toast') || el;
          colourPairs.push({ selector: host.localName + ' ' + el.className, foreground: style.color, background: host.matches('candor-select') ? getComputedStyle(el).backgroundColor : host.matches('candor-disclosure, candor-accordion-item') ? resolvedBackground(host) : getComputedStyle(box).backgroundColor, size: parseFloat(style.fontSize), weight: parseInt(style.fontWeight) });
        }
      }
      for (const selector of ['.workflow-status h3', '#workflow-help', '.segment__time', '.segment__text', '.workflow-controls .button--primary']) {
        const el = document.querySelector(selector); if (!el) continue;
        const chain = []; for (let parent = el; parent; parent = parent.parentElement) chain.unshift(parent);
        const background = chain.reduce((back, item) => blend(rgba(getComputedStyle(item.localName === 'candor-card' ? item.shadowRoot.querySelector('.card') : item).backgroundColor), back), [255, 255, 255]);
        const foreground = blend(rgba(getComputedStyle(el).color), background);
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        contrasts[selector] = Math.round((values[0] + .05) / (values[1] + .05) * 100) / 100;
      }
      const readingMeasures = [...document.querySelectorAll('.disclosure--inline, .settings-details, .explanation-prose, .segment__text, .record-hint:not(.performance-summary)')]
        .filter(el => el.checkVisibility({ checkVisibilityCSS: true })).map(el => {
          const style = getComputedStyle(el);
          context.font = style.fontSize + ' ' + style.fontFamily;
          return { selector: el.className, widthCh: el.getBoundingClientRect().width / context.measureText('0').width,
            font: style.fontFamily, size: parseFloat(style.fontSize), leading: style.lineHeight };
        });
      if (readingMeasures.some(item => item.widthCh > 65.5)) throw new Error('Reading column exceeds 65ch: ' + JSON.stringify(readingMeasures));
      return { name: ${JSON.stringify(name)}, width: innerWidth, height: innerHeight,
        horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('.app-header').scrollWidth > document.querySelector('.app-header').clientWidth + 1,
        contrasts, colourPairs, smallText, readingMeasures,
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
    await win.webContents.executeJavaScript("document.fonts.load('16px \"Noto Sans\"').then(() => true)");
    await win.webContents.executeJavaScript(`(async () => {
      await customElements.whenDefined('candor-card');
      for (const card of document.querySelectorAll('candor-card')) {
        await card.updateComplete;
        const box = card.shadowRoot.querySelector('.card');
        if (card.variant !== (card.classList.contains('step-card') ? 'default' : 'outlined') || getComputedStyle(box).boxShadow !== 'none') throw new Error('Unexpected card elevation');
        if (!card.shadowRoot.querySelector('.card__header').hidden || !card.shadowRoot.querySelector('.card__footer').hidden) throw new Error('Empty card slots retain chrome');
      }
    })()`);
    if (await win.webContents.executeJavaScript("!!document.querySelector('[title]')")) throw new Error('Native title tooltip found; use Candor tooltip');
    // Attach after the renderer exists. Offscreen windows have no OS focus;
    // renderer emulation lets trusted keys exercise real :focus-visible rules.
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await win.webContents.executeJavaScript(`(() => {
      const realNow = performance.now.bind(performance); let offset = 0;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); // Offscreen fixture represents a foreground recorder.
      const readFrequency = AnalyserNode.prototype.getByteFrequencyData;
      AnalyserNode.prototype.getByteFrequencyData = function(data) { readFrequency.call(this, data); window.previewFftPeak = Math.max(...data); window.previewFftState = this.context.state; window.previewFftTime = this.context.currentTime; };
      Object.defineProperty(performance, 'now', { value: () => realNow() + offset });
      window.advancePreviewClock = () => { offset += 38000; };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
        await new Promise(resolve => setTimeout(resolve, 400));
        const context = new AudioContext({ sinkId: { type: 'none' } });
        const oscillator = context.createOscillator(); oscillator.frequency.value = 440;
        const gain = context.createGain(); gain.gain.value = 0.2;
        const destination = context.createMediaStreamDestination();
        oscillator.connect(gain); gain.connect(destination); oscillator.start(); await context.resume();
        window.previewTone = oscillator; window.previewGain = gain;
        const track = destination.stream.getAudioTracks()[0]; const stop = track.stop.bind(track);
        track.stop = () => { stop(); oscillator.stop(); void context.close(); };
        return destination.stream;
      } });
      // Use the real MediaRecorder so the generated stream is consumed like a microphone.
    })()`);
    await capture('ready');
    nativeTheme.themeSource = 'light'; await wait(350); await capture('ready-light');
    nativeTheme.themeSource = 'dark'; await wait(350);
    if (!await win.webContents.executeJavaScript(`(() => {
      const actions = document.querySelector('.record-actions');
      return actions.querySelectorAll('button').length === 1 && !!actions.querySelector('.copy-option')
        && !document.querySelector('[data-action=transcribe]') && !actions.textContent.includes('Discard')
        && document.querySelector('.settings-details').label === 'Transcription settings';
    })()`)) throw new Error('Ready secondary actions are not simplified');

    win.setSize(1024, 680); await capture('ready-short'); win.setSize(1100, 820);
    const stopPosition = () => win.webContents.executeJavaScript("(() => { const r = document.querySelector('[data-action=stop]').getBoundingClientRect(); return JSON.stringify([r.x,r.y,r.width,r.height]); })()");
    const readyStopPosition = await stopPosition();
    await click('[data-action="record"]'); await capture('starting'); await waitForRecording();
    await wait(1000);
    const bandCenter = async () => win.webContents.executeJavaScript(`(() => {
      const canvas = document.querySelector('app-audio-spectrum canvas');
      const pixels = canvas.getContext('2d').getImageData(canvas.width - 2, 0, 2, canvas.height).data;
      let total = 0, weighted = 0;
      for (let y = 0; y < canvas.height; y++) { const alpha = pixels[(y * 2) * 4 + 3]; total += alpha; weighted += y * alpha; }
      if (!total) return { error: 'No spectrum at newest edge', mode: document.querySelector('.spectrum-display').getAttribute('data-mode'), width: canvas.width, height: canvas.height, hidden: document.hidden, audio: window.previewTone.context.state, peak: window.previewFftPeak, state: window.previewFftState, sampleTime: window.previewFftTime, sourceTime: window.previewTone.context.currentTime, streamActive: window.previewGain.context.state };
      return weighted / total;
    })()`);
    await capture('recording-low-tone');
    await chooseTheme('light'); await capture('theme-recording-light');
    await chooseTheme('dark'); await capture('theme-recording-dark');
    if (!await win.webContents.executeJavaScript("document.querySelector('.spectrum-display').dataset.mode === 'spectrogram' && !document.querySelector('[data-action=stop]').disabled")) throw new Error('Theme switching interrupted live recording');
    await chooseTheme('system');
    const lowBand = await bandCenter();
    if (typeof lowBand !== 'number') throw new Error(JSON.stringify(lowBand));
    await win.webContents.executeJavaScript("window.previewTone.frequency.value = 1760");
    await wait(800);
    await capture('recording-high-tone');
    const highBand = await bandCenter();
    if (typeof highBand !== 'number') throw new Error(JSON.stringify(highBand));
    if (highBand >= lowBand - 3) throw new Error('Spectrum did not follow the change in real input frequency');
    await win.webContents.executeJavaScript('window.advancePreviewClock()'); await wait(300);
    await capture('recording');
    if (await stopPosition() !== readyStopPosition) throw new Error('Stop moved when recording started');
    win.setSize(360, 780); await capture('recording-small'); win.setSize(1100, 820);
    nativeTheme.themeSource = 'light'; await wait(200); await capture('recording-light'); nativeTheme.themeSource = 'dark';
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await wait(300); await capture('recording-reduced-motion');
    if (await win.webContents.executeJavaScript("document.querySelector('.spectrum-display').getAttribute('data-mode')") !== 'levels') throw new Error('Reduced motion still scrolls the spectrum');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    await win.webContents.executeJavaScript("window.previewGain.gain.value = 0"); await wait(500); await capture('recording-quiet');
    if (await win.webContents.executeJavaScript("document.querySelector('.spectrum-label').textContent") !== 'Recording') throw new Error('Quiet input hid the active recording label');
    await win.webContents.executeJavaScript("window.previewGain.gain.value = 0.2");
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
    await click('.copy-option');
    if (await win.webContents.executeJavaScript("document.querySelector('.copy-option input').checked")) throw new Error('Timing checkbox label did not toggle the native input');
    await click('.copy-option');
    if (!await win.webContents.executeJavaScript("document.querySelector('.copy-option input').checked")) throw new Error('Timing checkbox did not restore timing');
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
    await win.webContents.executeJavaScript("document.querySelector('.performance-summary').scrollIntoView({ block: 'center' })");
    await capture('performance-small');
    win.setSize(1100, 820);
    await win.webContents.executeJavaScript("document.querySelector('.disclosure--inline').shadowRoot.querySelector('button').focus(); document.querySelector('.disclosure--inline').scrollIntoView({ block: 'center' })");
    if (!await win.webContents.executeJavaScript("!!document.querySelector('.transcript-output').shadowRoot.querySelector('.card__footer:not([hidden])') && document.querySelector('.disclosure--inline').parentElement.slot === 'footer'")) throw new Error('Timing disclosure is not in the Card footer');
    await capture('timing-disclosure-focus');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    if (!await win.webContents.executeJavaScript("document.querySelector('.disclosure--inline').open")) throw new Error('Timing disclosure keyboard toggle failed');
    await capture('timing-disclosure-open');
    await win.webContents.executeJavaScript("document.querySelectorAll('.quiet-details').forEach(el => el.open = true); document.querySelector('.quiet-details').scrollIntoView({ block: 'start' })");
    await capture('nested-diagnostics');
    win.setSize(360, 780);
    await win.webContents.executeJavaScript("document.querySelector('.quiet-details').scrollIntoView({ block: 'start' })");
    await capture('nested-diagnostics-small');
    await win.webContents.executeJavaScript("document.querySelector('.disclosure--subtle').scrollIntoView({ block: 'start' })");
    await capture('nested-rows-small');
    win.setSize(1100, 820); nativeTheme.themeSource = 'light'; await wait(350); await capture('nested-diagnostics-light');
    nativeTheme.themeSource = 'dark'; await wait(350);
    // Candor child activation must leave the standalone parent disclosure open.
    await click('.disclosure--subtle >>> summary'); await wait(80); // Native details toggle synchronizes the host asynchronously.
    if (!await win.webContents.executeJavaScript("document.querySelector('.quiet-details').open && !document.querySelector('.disclosure--subtle').open")) throw new Error('Nested toggle changed its parent: ' + await win.webContents.executeJavaScript("JSON.stringify({parent: document.querySelector('.quiet-details').open, child: document.querySelector('.disclosure--subtle').open, native: document.querySelector('.disclosure--subtle').shadowRoot.querySelector('details').open})"));
    await win.webContents.executeJavaScript("document.querySelector('.disclosure--subtle').shadowRoot.querySelector('summary').focus()");
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await wait(80);
    if (!await win.webContents.executeJavaScript("document.querySelector('.quiet-details').open && document.querySelector('.disclosure--subtle').open")) throw new Error('Nested keyboard toggle failed');
    await win.webContents.executeJavaScript("document.querySelectorAll('.quiet-details').forEach(el => el.open = false)");
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
    await win.webContents.executeJavaScript("window.RealAudioContext = window.AudioContext; window.AudioContext = class extends window.RealAudioContext { createMediaStreamSource() { throw new Error('Fixture analysis failure'); } }; void 0");
    await click('[data-action="record"]'); await capture('starting-again'); await waitForRecording();
    await capture('recording-display-unavailable');
    win.setSize(360, 780); await capture('recording-display-unavailable-small'); win.setSize(1100, 820);
    if (!await win.webContents.executeJavaScript("!!document.querySelector('.spectrum-fallback') && !document.querySelector('[data-action=stop]').disabled")) throw new Error('Display failure interrupted recording');
    await win.webContents.executeJavaScript("window.AudioContext = window.RealAudioContext; void 0");
    failNext = true;
    await win.webContents.executeJavaScript('window.advancePreviewClock()'); await wait(300);
    await click('[data-action="stop"]'); await wait(1100); await capture('retry');
    if (!await win.webContents.executeJavaScript("!!document.querySelector('.record-actions [data-action=transcribe]') && !document.querySelector('[data-action=record]').disabled")) throw new Error('Failed recording cannot retry or start again');
    await click('.record-actions [data-action="transcribe"]'); await capture('retry-processing');
    if (await win.webContents.executeJavaScript("!!document.querySelector('.record-actions [data-action=transcribe]')")) throw new Error('Retry remains visible during processing');
    await wait(1100);

    await click('#audio-file-tab'); await capture('audio-file');
    failPicker = true; await click('[data-action="choose-file"]'); await wait(100); await capture('candor-toast');
    if (!await win.webContents.executeJavaScript("document.querySelector('candor-toast-container').shadowRoot.querySelector('.live--assertive').textContent.includes('Failed to select file')")) throw new Error('Toast was not added to the persistent assertive region');
    win.setSize(360, 780); await capture('candor-toast-small'); win.setSize(1100, 820);
    nativeTheme.themeSource = 'light'; await wait(350); await capture('candor-toast-light'); nativeTheme.themeSource = 'dark'; await wait(350);
    await win.webContents.executeJavaScript("document.querySelector('candor-toast').shadowRoot.querySelector('[aria-label=Dismiss]').click()");
    if (await win.webContents.executeJavaScript("!!document.querySelector('candor-toast')")) throw new Error('Dismiss did not remove the toast');
    await click('[data-action="choose-file"]'); await wait(100); await capture('file-selected');
    filename = 'Research-interview-session-about-complex-decisions-and-unclear-expectations-with-detailed-follow-up-notes-2026-10-24.wav';
    await click('[data-action="choose-file"]'); await wait(100);
    win.setSize(360, 780); await capture('file-long-name'); win.setSize(1100, 820);
    await click('[data-action="transcribe"]'); await capture('file-processing'); await wait(1000);
    await capture('file-result');
    await click('#record-audio-tab');
    if (await win.webContents.executeJavaScript("!!document.querySelector('.record-actions [data-action=transcribe]')")) throw new Error('Retry is visible after success');
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
    await win.webContents.executeJavaScript("document.querySelector('.models-page tbody tr:last-child').scrollIntoView({ block: 'center' })");
    await capture('models-added');
    await win.webContents.executeJavaScript("document.querySelector('.app-container').scrollTop = 0");
    nativeTheme.themeSource = 'light'; await wait(350); await capture('models-light');
    nativeTheme.themeSource = 'dark'; await wait(350);
    win.setSize(360, 780); await capture('models-small');
    if (!await win.webContents.executeJavaScript("document.querySelector('#app-panel-models .table-container').tabIndex === 0")) throw new Error('Overflowing table is not keyboard reachable');
    win.setSize(1100, 820); await wait(150);
    if (await win.webContents.executeJavaScript("document.querySelector('#app-panel-models .table-container').hasAttribute('tabindex')")) throw new Error('Fitting table adds an unnecessary tab stop');
    await click('#app-panel-models .button'); await capture('model-download');
    if (!await win.webContents.executeJavaScript("document.querySelector('#app-panel-models [role=progressbar]').getAttribute('aria-label').includes('tiny')")) throw new Error('Download progress lacks a model label');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await capture('model-download-reduced-motion');
    if (!await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('#app-panel-models .progress-bar__fill')).animationName === 'none'")) throw new Error('Download progress ignores reduced motion');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    await wait(1600);
    await win.webContents.executeJavaScript("document.querySelectorAll('candor-toast').forEach(el => el.shadowRoot.querySelector('[aria-label=Dismiss]').click())");
    await click('#app-tab-history'); await capture('history');
    history = [{ id: 'fixture', status: 'completed', fileName: 'Recorded answer', options: { model: 'base' }, audioDuration: 38.6, transcriptionTime: 1450, startedAt: '2026-10-24T21:30:00.000Z', result: fixture }];
    await click('#app-panel-history [aria-label="Refresh history"]'); await wait(100); await capture('history-populated');
    await win.webContents.executeJavaScript("document.querySelector('#app-tab-history').focus(); document.querySelector('#app-panel-history [aria-label=\"Refresh history\"]').focus()");
    await capture('candor-tooltip-focus');
    if (!await win.webContents.executeJavaScript("(() => { const host = document.querySelector('#app-panel-history candor-tooltip'); const bubble = host.shadowRoot.querySelector('.tooltip__bubble'); return bubble.matches(':popover-open') && bubble.getAttribute('aria-hidden') === 'true' && !host.querySelector('button').hasAttribute('aria-describedby'); })()")) throw new Error('Candor tooltip contract failed');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await wait(50);
    if (await win.webContents.executeJavaScript("document.querySelector('#app-panel-history candor-tooltip').shadowRoot.querySelector('.tooltip__bubble').matches(':popover-open')")) throw new Error('Escape did not dismiss the tooltip');
    await win.webContents.executeJavaScript("document.querySelector('#app-tab-history').focus()");
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10 });
    const hoverPoint = await win.webContents.executeJavaScript("(() => { const r = document.querySelector('#app-panel-history [aria-label=\"Refresh history\"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...hoverPoint }); await wait(200); await capture('candor-tooltip-hover');
    if (!await win.webContents.executeJavaScript("document.querySelector('#app-panel-history candor-tooltip').shadowRoot.querySelector('.tooltip__bubble').matches(':popover-open')")) throw new Error('Pointer hover did not show Candor tooltip');
    const bubblePoint = await win.webContents.executeJavaScript("(() => { const r = document.querySelector('#app-panel-history candor-tooltip').shadowRoot.querySelector('.tooltip__bubble').getBoundingClientRect(); return {x: r.x+r.width/2, y: r.y+r.height/2}; })()");
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...bubblePoint }); await wait(100);
    if (!await win.webContents.executeJavaScript("document.querySelector('#app-panel-history candor-tooltip').shadowRoot.querySelector('.tooltip__bubble').matches(':popover-open')")) throw new Error('Tooltip disappeared when pointer entered bubble');
    nativeTheme.themeSource = 'light'; await wait(350); await capture('candor-tooltip-light');
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10 });
    nativeTheme.themeSource = 'light'; await wait(350); await capture('history-light');
    nativeTheme.themeSource = 'dark'; await wait(350);
    win.setSize(360, 780); await capture('history-small');
    // A build without the alternate runtime loads its own initial capability catalog.
    alternateReady = false; win.setSize(1100, 820); nativeTheme.themeSource = 'dark';
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
    await wait(500); await click('#app-tab-models');
    await win.webContents.executeJavaScript("document.querySelector('.models-page tbody tr:last-child').scrollIntoView({ block: 'center' })");
    await capture('models-runtime-unavailable');
    if (!await win.webContents.executeJavaScript("document.querySelector('.models-page tbody tr:last-child button').disabled")) throw new Error('Unavailable engine offers an unusable download');
    // Native single-choice radios -> Angular preference, with OS changes and reload.
    await click('#app-tab-transcription');
    const pageColour = () => win.webContents.executeJavaScript('getComputedStyle(document.body).backgroundColor');
    nativeTheme.themeSource = 'dark'; await wait(350);
    await chooseTheme('light'); const explicitLight = await pageColour(); await capture('theme-explicit-light');
    nativeTheme.themeSource = 'light'; await wait(350);
    await chooseTheme('dark'); const explicitDark = await pageColour(); await capture('theme-explicit-dark');
    if (explicitLight === explicitDark) throw new Error('Explicit themes do not change the surface');
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); }); await wait(500);
    if (!await win.webContents.executeJavaScript("document.querySelector('#theme-control input[value=dark]').checked && document.documentElement.dataset.theme === 'dark' && localStorage.getItem('whisper.theme') === 'dark'")) throw new Error('Theme preference did not survive reload');
    await chooseTheme('system'); await capture('theme-system-light');
    if (await pageColour() !== explicitLight) throw new Error('System did not follow the light OS theme');
    nativeTheme.themeSource = 'dark'; await wait(350); await capture('theme-system-dark');
    if (await pageColour() !== explicitDark) throw new Error('System did not follow the dark OS theme');
    if (!await win.webContents.executeJavaScript("!document.documentElement.hasAttribute('data-theme') && document.querySelector('#theme-control').getAttribute('aria-labelledby') === 'theme-legend' && document.querySelector('#theme-legend').textContent === 'Theme'")) throw new Error('System/theme accessible name contract failed');
    await win.webContents.executeJavaScript("document.querySelector('#theme-control input:checked').focus()");
    const themeKey = async (key, code) => {
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code });
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code });
      await wait(30);
    };
    const expectTheme = async value => {
      if (!await win.webContents.executeJavaScript(`document.activeElement.matches('#theme-control input[value=${value}]') && document.activeElement.checked && document.querySelectorAll('#theme-control input:checked').length === 1 && localStorage.getItem('whisper.theme') === '${value}'`)) throw new Error('Theme keyboard selection failed: ' + value);
    };
    await themeKey('ArrowRight', 39); await expectTheme('light');
    await themeKey('ArrowLeft', 37); await expectTheme('system');
    await themeKey('Home', 36); await expectTheme('light');
    await themeKey('End', 35); await expectTheme('system');
    await win.webContents.executeJavaScript("document.querySelector('#theme-control input[value=dark]').focus()");
    await themeKey(' ', 32); await expectTheme('dark');
    await themeKey('End', 35); await expectTheme('system');
    await themeKey('Tab', 9);
    if (!await win.webContents.executeJavaScript("document.activeElement.id === 'app-tab-transcription'")) throw new Error('Theme radio group adds extra Tab stops');
    await themeKey('Tab', 9); // Return focus below the group before refocusing for a keyboard-visible ring.
    await win.webContents.executeJavaScript("document.querySelector('#theme-control input:checked').focus()");
    await capture('theme-keyboard-focus');
    win.setSize(360, 780); await capture('theme-small');
    await fs.writeFile(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.log('Visual review:', output);
    clearTimeout(watchdog);
    app.quit();
  } catch (error) { clearTimeout(watchdog); console.error(error); app.exit(1); }
});
app.on('will-quit', () => { void fs.rm(profile, { recursive: true, force: true }).catch(() => {}); });
