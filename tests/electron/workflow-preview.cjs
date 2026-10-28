// Offscreen visual review of the real built Angular app with local fixture IPC.
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const output = path.join(os.tmpdir(), 'whisper-visual-review', process.env.WHISPER_VISUAL_PASS || 'current');
const profile = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'whisper-visual-profile-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', process.env.WHISPER_VISUAL_SCALE || '1');
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
const installedModels = new Set(['base']);
let deletionBlocked = false;
let failDelete = false;
let finishDiscovery;
const initialDiscovery = new Promise(resolve => { finishDiscovery = resolve; });
ipcMain.handle('get-available-models', async () => {
  await initialDiscovery;
  return SPEECH_MODELS.map(model => ({ ...model, size: modelSize(model.sizeBytes), installed: installedModels.has(model.name), deletionBlocked, available: model.engine !== 'transcribe.cpp' || alternateReady, unavailableReason: 'Parakeet runtime is not included in this build.' }));
});
let finishDownload;
ipcMain.handle('download-model', (_event, name) => new Promise(resolve => {
  finishDownload = () => { installedModels.add(name); resolve({ success: true }); };
}));
ipcMain.handle('delete-model', async (_event, name) => {
  if (deletionBlocked) throw new Error('Finish transcription before deleting a model.');
  await new Promise(resolve => setTimeout(resolve, 500));
  if (failDelete) { failDelete = false; throw new Error('Could not remove model file.'); }
  installedModels.delete(name); return { success: true };
});
ipcMain.handle('get-system-info', () => ({ platform: process.platform, version: '1.1.5' }));
let history = [];
let historyDelay = 0;
ipcMain.handle('get-transcription-history', async () => { if (historyDelay) await new Promise(resolve => setTimeout(resolve, historyDelay)); return history; });
let filename = 'interview-answer.wav';
let failPicker = false;
ipcMain.handle('select-audio-file', () => { if (failPicker) { failPicker = false; throw new Error('File picker unavailable'); } return { path: `C:/Audio/${filename}`, size: 5 * 1024 * 1024 }; });
const savedFormats = [];
ipcMain.handle('save-transcript', (_event, _data, format) => { savedFormats.push(format); return `C:/Exports/transcript.${format}`; });
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
  const watchdog = setTimeout(() => { console.error('Visual review timed out'); app.exit(1); }, 180000);
  const win = new BrowserWindow({ width: 1100, height: 820, show: false, webPreferences: {
    offscreen: true, backgroundThrottling: false, preload: path.join(root, 'dist/electron/preload.js'),
  } });
  const metrics = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const resize = async (width, height) => {
    win.setSize(width, height);
    // Native Linux resize delivery is asynchronous; settle before hit testing.
    await wait(120);
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  };
  // Exercise native scrollbars through their transparent grab area, not DOM scroll assignments.
  const checkScrollbar = async (selector, horizontal = false) => {
    await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollTop = el.scrollLeft = 0;
      el.scrollIntoView({ block: ${horizontal ? "'end'" : "'center'"} });
      if (${horizontal}) {
        const panel = document.querySelector('.app-container');
        panel.scrollTop += Math.max(0, el.getBoundingClientRect().bottom - Math.min(innerHeight, panel.getBoundingClientRect().bottom) + 32);
      }
    })()`);
    await wait(150); // Let the compositor update hit testing after moving a tall table into view.
    const point = await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      const bar = getComputedStyle(el, '::-webkit-scrollbar');
      const thumb = getComputedStyle(el, '::-webkit-scrollbar-thumb');
      if (parseFloat(bar.width) !== 24 || parseFloat(bar.height) !== 24 || thumb.backgroundClip !== 'padding-box') throw new Error('Candor scrollbar construction missing: ' + ${JSON.stringify(selector)});
      const horizontal = ${horizontal};
      const visible = horizontal ? el.clientWidth : el.clientHeight;
      const total = horizontal ? el.scrollWidth : el.scrollHeight;
      if (total <= visible) throw new Error('Scrollbar fixture does not overflow: ' + ${JSON.stringify(selector)});
      const margin = 6; // Current --radius-md track-end inset; grab stays well within the thumb.
      const center = margin + (visible - 2 * margin) * visible / total / 2;
      // Three pixels into the transparent content-side border: outside the visible 6px bar.
      return horizontal
        ? { x: r.left + center, y: r.bottom - parseFloat(s.borderBottomWidth || 0) - 21 }
        : { x: r.right - parseFloat(s.borderRightWidth || 0) - 21, y: r.top + center };
    })()`);
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: point.x + (horizontal ? 70 : 0), y: point.y + (horizontal ? 0 : 70) });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: point.x + (horizontal ? 70 : 0), y: point.y + (horizontal ? 0 : 70) });
    await wait(100);
    if (!await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).${horizontal ? 'scrollLeft' : 'scrollTop'} > 0`)) throw new Error('Transparent scrollbar grab area did not drag: ' + selector + ' at ' + JSON.stringify(point));
    await win.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollTop = el.scrollLeft = 0; (el.matches('.app-container') ? el.querySelector('button:not(:disabled)') : el).focus(); })()`);
    const key = horizontal ? { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 } : { key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 };
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    await wait(200);
    if (!await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).${horizontal ? 'scrollLeft' : 'scrollTop'} > 0`)) throw new Error('Native keyboard scrolling failed: ' + selector);
  };
  const click = async selector => {
    await win.webContents.executeJavaScript(`(() => {
      const el = ${JSON.stringify(selector)}.split(' >>> ').reduce((root, part, i) => (i ? root.shadowRoot : root).querySelector(part), document);
      el.scrollIntoView({ block: 'nearest' });
    })()`);
    // Scroll/resize delivery and compositor hit testing are asynchronous.
    await wait(100);
    const point = await win.webContents.executeJavaScript(`(() => {
      const el = ${JSON.stringify(selector)}.split(' >>> ').reduce((root, part, i) => (i ? root.shadowRoot : root).querySelector(part), document);
      const rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
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
    // Flush newly changed roles/fonts before settling transitions in the hidden renderer.
    await win.webContents.executeJavaScript("(async () => { for (const el of document.querySelectorAll('.button, .input')) void getComputedStyle(el).color; await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()");
    await wait(250); // Let the 200ms control colour transitions settle before sampling.
    await fs.writeFile(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    metrics.push(await win.webContents.executeJavaScript(`(() => {
      const panel = document.querySelector('.app-container');
      const controls = [...document.querySelectorAll('.workflow-controls button')];
      const stop = document.querySelector('[data-action=stop]');
      const spectrum = document.querySelector('app-audio-spectrum');
      if (stop?.checkVisibility() && spectrum?.checkVisibility() && spectrum.getBoundingClientRect().top < stop.getBoundingClientRect().bottom) throw new Error('Microphone feedback is not below Stop & transcribe');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const rgba = value => { context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
      const blend = (front, back) => front.slice(0, 3).map((v, i) => v * front[3] / 255 + back[i] * (1 - front[3] / 255));
      const resolvedBackground = el => {
        const choice = el.closest('.theme-choice');
        if (choice && rgba(getComputedStyle(choice).backgroundColor)[3] === 0) return getComputedStyle(choice.closest('.theme-track'), '::before').backgroundColor;
        const chain = []; for (let parent = el; parent; parent = parent.parentElement) chain.unshift(parent);
        const rgb = chain.reduce((back, item) => blend(rgba(getComputedStyle(item.localName === 'candor-card' ? item.shadowRoot.querySelector('.card') : item.localName === 'candor-modal' ? item.shadowRoot.querySelector('.modal__panel') : item).backgroundColor), back), [255, 255, 255]);
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
      for (const el of document.querySelectorAll('.app-container, .transcript-view, .table-container')) {
        if (!el.checkVisibility() || (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth)) continue;
        colourPairs.push({ selector: 'scrollbar ' + el.className, foreground: getComputedStyle(el, '::-webkit-scrollbar-thumb').backgroundColor, background: resolvedBackground(el), nonText: true });
      }
      const iconMetrics = [...document.querySelectorAll('i.ph, i.ph-fill, i.ph-bold')].filter(el => el.checkVisibility({ checkVisibilityCSS: true })).map(el => {
        const style = getComputedStyle(el);
        const weights = ['ph', 'ph-fill', 'ph-bold'].filter(weight => el.classList.contains(weight));
        if (weights.length !== 1 || el.getAttribute('aria-hidden') !== 'true' || !getComputedStyle(el, '::before').fontFamily.includes('Phosphor') || ['none', 'normal', ''].includes(getComputedStyle(el, '::before').content)) throw new Error('Invalid or unnamed decorative Phosphor icon: ' + el.className);
        const button = el.closest('.button');
        const expected = button?.classList.contains('button--icon') ? (weights[0] === 'ph-fill' ? 28 : 20) : button ? parseFloat(getComputedStyle(button).fontSize) : null;
        if (expected !== null && parseFloat(style.fontSize) !== expected) throw new Error('Icon does not follow its control size: ' + el.className);
        if (!el.closest('button:disabled')) colourPairs.push({ selector: 'icon ' + el.className, foreground: style.color, background: resolvedBackground(el), nonText: true });
        return { classes: el.className, size: parseFloat(style.fontSize), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height };
      });
      for (const host of document.querySelectorAll('.timing-details')) {
        const label = host.shadowRoot?.querySelector('[part=label]');
        if (!label?.checkVisibility()) continue;
        const icon = getComputedStyle(label, '::before');
        if (icon.maskImage === 'none' || parseFloat(icon.width) !== parseFloat(getComputedStyle(label).fontSize)) throw new Error('Disclosure icon is absent or incorrectly sized');
        colourPairs.push({ selector: host.classList.contains('timing-details') ? 'timing help mask' : 'settings gear mask', foreground: icon.backgroundColor, background: resolvedBackground(host), nonText: true });
      }
      for (const selector of ['.overwrite-modal p', '.export-controls label', '.file-name', '.file-size', '.model-name', '.transcript-metadata dt', '.transcript-metadata dd', '.model-repository a', '.sort-header', '.models-page .info-alert a', '.spectrum-placeholder-label', '.spectrum-live-label', '.action-reason', '#history-refresh-status', '.spectrum-fallback', '.disclosure > summary', '.workflow-number', '.tabs__tab[aria-selected=true]', '.copy-option', '.record-hint', '.explanation-prose', '.segment__time', '.segment__text', '.record-error', '.status-text', '.badge', '.table-host th', '.table-host td', '.button:not(:disabled)', '.input', '.alert__message', '.toast__message', '.local-badge']) {
        for (const el of document.querySelectorAll(selector)) {
          if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
          const style = getComputedStyle(el);
          const background = resolvedBackground(el);
          colourPairs.push({ selector, foreground: style.color, background, size: parseFloat(style.fontSize), weight: parseInt(style.fontWeight), text: el.textContent.trim().slice(0, 80) });
        }
      }
      for (const link of document.querySelectorAll('.model-repository a, .models-page .info-alert a')) {
        if (!link.checkVisibility({ checkVisibilityCSS: true })) continue;
        const style = getComputedStyle(link);
        colourPairs.push({ selector: 'repository visited token pairing', foreground: style.getPropertyValue('--color-link-visited').trim(), background: resolvedBackground(link), size: parseFloat(style.fontSize), weight: parseInt(style.fontWeight), text: link.textContent.trim() });
      }
      for (const selector of ['.input', '.button:focus-visible', '.sort-header:focus-visible', '.model-repository a:focus-visible', '.status-text i', '.local-badge--recording i', '.workflow-connector', '.spectrum-display canvas', '.spectrum-bars span']) {
        for (const el of document.querySelectorAll(selector)) {
          if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
          const style = getComputedStyle(el);
          let parent = el.matches('.workflow-connector') ? el.closest('.workflow-panel') : el.parentElement;
          const background = resolvedBackground(parent);
          colourPairs.push({ selector, foreground: el.matches('.spectrum-bars span') ? style.backgroundColor : el.matches('i, canvas') ? style.color : el.matches(':focus-visible') ? style.outlineColor : style.borderTopColor, background, nonText: true });
        }
      }
      for (const el of document.querySelectorAll('.theme-option input:checked + .theme-choice')) {
        colourPairs.push({ selector: 'theme selected border', foreground: getComputedStyle(el).borderTopColor, background: getComputedStyle(el.closest('.theme-track'), '::before').backgroundColor, nonText: true });
        if (el.previousElementSibling.matches(':focus-visible')) colourPairs.push({ selector: 'theme focus ring', foreground: getComputedStyle(el).outlineColor, background: resolvedBackground(document.querySelector('.app-header')), nonText: true });
      }
      for (const host of document.querySelectorAll('candor-tooltip, candor-toast, candor-disclosure, candor-accordion-item, candor-modal')) {
        for (const el of host.shadowRoot?.querySelectorAll('.tooltip__bubble, .toast__message, .disclosure__trigger, .accordion-item__title, .select, .modal__title, .modal__close') || []) {
          if ((!host.matches('candor-modal') && !host.checkVisibility()) || !el.checkVisibility({ checkVisibilityCSS: true })) continue;
          const style = getComputedStyle(el);
          const box = el.closest('.toast') || el;
          colourPairs.push({ selector: host.localName + ' ' + el.className, foreground: style.color, background: host.matches('candor-modal') ? resolvedBackground(el) : host.matches('candor-select') ? getComputedStyle(el).backgroundColor : host.matches('candor-disclosure, candor-accordion-item') ? resolvedBackground(host) : getComputedStyle(box).backgroundColor, size: parseFloat(style.fontSize), weight: parseInt(style.fontWeight), nonText: el.matches('.modal__close'), supplementary: host.matches('.timing-details') && el.matches('.disclosure__trigger') });
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
      const readingMeasures = [...document.querySelectorAll('.disclosure--inline, .explanation-prose, .segment__text, .record-hint:not(.performance-summary)')]
        .filter(el => el.checkVisibility({ checkVisibilityCSS: true })).map(el => {
          const style = getComputedStyle(el);
          context.font = style.fontSize + ' ' + style.fontFamily;
          return { selector: el.className, widthCh: el.getBoundingClientRect().width / context.measureText('0').width,
            font: style.fontFamily, size: parseFloat(style.fontSize), leading: style.lineHeight };
        });
      if (readingMeasures.some(item => item.widthCh > 65.5)) throw new Error('Reading column exceeds 65ch: ' + JSON.stringify(readingMeasures));
      return { name: ${JSON.stringify(name)}, width: innerWidth, height: innerHeight,
        horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('.app-header').scrollWidth > document.querySelector('.app-header').clientWidth + 1,
        contrasts, colourPairs, smallText, readingMeasures, iconMetrics,
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
    // Attach after the renderer exists. Offscreen windows have no OS focus;
    // renderer emulation lets trusted keys exercise real :focus-visible rules.
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await capture('models-checking');
    if (!await win.webContents.executeJavaScript(`document.querySelector('.workflow-status').textContent.includes('Checking local models') && !document.querySelector('.workflow-panel').textContent.includes('Download a model')`)) throw new Error('Pending discovery incorrectly offers a download');
    await resize(360, 780); await capture('models-checking-small'); await resize(1100, 820);
    nativeTheme.themeSource = 'light'; await wait(250); await capture('models-checking-light'); nativeTheme.themeSource = 'dark';
    await click('#app-tab-models'); await capture('models-initial-loading');
    finishDiscovery(); await wait(300);
    await capture('models-initial-loaded');
    await click('#app-tab-transcription');
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
    await win.webContents.executeJavaScript(`(() => {
      const realNow = performance.now.bind(performance); let offset = 0;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); // Offscreen fixture represents a foreground recorder.
      const readFrequency = AnalyserNode.prototype.getByteFrequencyData;
      AnalyserNode.prototype.getByteFrequencyData = function(data) { readFrequency.call(this, data); if (window.previewFullBand) data.fill(220); window.previewFftPeak = Math.max(...data); window.previewFftState = this.context.state; window.previewFftTime = this.context.currentTime; };
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
    if (process.env.WHISPER_SCROLLBAR_TABLE_ONLY) {
      await click('#app-tab-models'); await resize(360, 780); await wait(150);
      await checkScrollbar('#app-panel-models .table-container', true); await capture('scrollbar-models-smoke');
      console.log('Native table scrollbar drag and keyboard check passed.');
      clearTimeout(watchdog); app.quit(); return;
    }
    const placeholderMatches = () => win.webContents.executeJavaScript("getComputedStyle(document.querySelector('.spectrum-placeholder-label')).color === getComputedStyle(document.querySelector('.spectrum-bars span')).backgroundColor");
    if (!await placeholderMatches()) throw new Error('Dark placeholder text and marks have different colours');
    const placeholderBounds = await win.webContents.executeJavaScript("(() => { const r = document.querySelector('.spectrum-bars').getBoundingClientRect(); return JSON.stringify([r.x,r.y,r.width,r.height]); })()");
    if (process.env.WHISPER_MODAL_DISMISS_ONLY) {
      const assertClosed = async label => {
        await wait(80);
        if (!await win.webContents.executeJavaScript("!document.querySelector('.settings-modal').open && !document.querySelector('.settings-modal').shadowRoot.querySelector('dialog').open && document.activeElement.matches('[data-action=settings]')")) throw new Error(label + ' failed to close and restore trigger focus');
      };
      await click('[data-action=settings]'); await click('.settings-modal >>> button[aria-label=Close]'); await assertClosed('Close button');
      await click('[data-action=settings]'); await click('.settings-modal [slot=footer] button'); await assertClosed('Done');
      await click('[data-action=settings]');
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: 2, y: 2 });
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: 2, y: 2 });
      await assertClosed('Backdrop');
      console.log('Modal close, Done and backdrop restore trigger focus.');
      clearTimeout(watchdog); app.quit(); return;
    }
    if (!await win.webContents.executeJavaScript("document.querySelector('.spectrum-placeholder-label').textContent === 'Audio spectrum' && getComputedStyle(document.querySelector('.spectrum-bars')).animationName === 'none' && !document.querySelector('#source-help')")) throw new Error('Idle spectrum placeholder or clean source switcher missing');
    await resize(360, 780);
    await win.webContents.executeJavaScript("document.querySelector('.record-actions').scrollIntoView({ block: 'center' })"); await capture('workflow-options-small');
    await resize(1100, 820); await win.webContents.executeJavaScript("document.querySelector('.app-container').scrollTop = 0");
    nativeTheme.themeSource = 'light'; await wait(350); await capture('ready-light');
    if (!await placeholderMatches()) throw new Error('Light placeholder text and marks have different colours');
    nativeTheme.themeSource = 'dark'; await wait(350);
    if (!await win.webContents.executeJavaScript(`(() => {
      const actions = document.querySelector('.record-actions');
      return actions.querySelectorAll('button').length === 2 && !!actions.querySelector('.copy-option')
        && !document.querySelector('[data-action=transcribe]') && !actions.textContent.includes('Discard')
        && actions.querySelector('[data-action=settings]').textContent.includes('Transcription settings');
    })()`)) throw new Error('Ready secondary actions are not simplified');

    await resize(1024, 500); await wait(150);
    await checkScrollbar('.app-container'); await capture('scrollbar-page-dark');
    nativeTheme.themeSource = 'light'; await wait(350); await checkScrollbar('.app-container'); await capture('scrollbar-page-light');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await capture('scrollbar-forced-colours');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    nativeTheme.themeSource = 'dark';
    await resize(1024, 680); await capture('ready-short'); await resize(1100, 820); await wait(150);
    await win.webContents.executeJavaScript("document.querySelector('.app-container').scrollTop = 0");
    const stopPosition = () => win.webContents.executeJavaScript("(() => { const r = document.querySelector('[data-action=stop]').getBoundingClientRect(); return JSON.stringify([r.x,r.y,r.width,r.height]); })()");
    const readyStopPosition = await stopPosition();
    await click('[data-action="record"]'); await capture('starting'); await waitForRecording();
    await wait(1000);
    await win.webContents.executeJavaScript('window.previewFullBand = true'); await wait(500);
    await capture('recording-full-band');
    const spectrumGeometry = await win.webContents.executeJavaScript(`(() => {
      const canvas = document.querySelector('app-audio-spectrum canvas');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width, right = -1, bars = 0, inside = false;
      for (let x = 0; x < canvas.width; x++) {
        let filled = false; for (let y = 0; y < canvas.height; y++) if (data[(y * canvas.width + x) * 4 + 3]) filled = true;
        if (filled) { left = Math.min(left, x); right = Math.max(right, x); if (!inside) bars++; } inside = filled;
      }
      return { dpr: devicePixelRatio, cssWidth: canvas.clientWidth, backingWidth: canvas.width, left, right, bars };
    })()`);
    await fs.writeFile(path.join(output, 'spectrum-geometry.json'), JSON.stringify(spectrumGeometry, null, 2));
    if (spectrumGeometry.bars !== 14 || spectrumGeometry.right < spectrumGeometry.backingWidth - 3 || spectrumGeometry.left > 2) throw new Error('Full-band spectrum does not span its canvas: ' + JSON.stringify(spectrumGeometry));
    await win.webContents.executeJavaScript('window.previewFullBand = false'); await wait(500);
    const bandCenter = async () => win.webContents.executeJavaScript(`(() => {
      const canvas = document.querySelector('app-audio-spectrum canvas');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let total = 0, weighted = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const alpha = pixels[(y * canvas.width + x) * 4 + 3]; total += alpha; weighted += x * alpha;
      }
      if (!total) return { error: 'No frequency bars', mode: document.querySelector('.spectrum-display').dataset.mode, peak: window.previewFftPeak };
      return weighted / total;
    })()`);
    await capture('recording-low-tone');
    if (!await win.webContents.executeJavaScript(`(() => { const r = document.querySelector('app-audio-spectrum canvas').getBoundingClientRect(); return JSON.stringify([r.x,r.y,r.width,r.height]) === ${JSON.stringify(placeholderBounds)}; })()`)) throw new Error('Live frequency bars do not occupy the placeholder geometry');
    await chooseTheme('light'); await capture('theme-recording-light');
    await chooseTheme('dark'); await capture('theme-recording-dark');
    if (!await win.webContents.executeJavaScript("document.querySelector('.spectrum-display').dataset.mode === 'frequency-bars' && !document.querySelector('[data-action=stop]').disabled")) throw new Error('Theme switching interrupted live recording');
    await chooseTheme('system');
    const lowBand = await bandCenter();
    if (typeof lowBand !== 'number') throw new Error(JSON.stringify(lowBand));
    await win.webContents.executeJavaScript("window.previewTone.frequency.value = 1760");
    await wait(800);
    await capture('recording-high-tone');
    const highBand = await bandCenter();
    if (typeof highBand !== 'number') throw new Error(JSON.stringify(highBand));
    if (highBand <= lowBand + 5) throw new Error('Spectrum did not follow the change in real input frequency');
    const speechSample = await fs.readFile(path.join(root, 'whisper.cpp/samples/jfk.wav')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (speechSample) {
    await win.webContents.executeJavaScript(`(async () => {
      const bytes = Uint8Array.from(atob(${JSON.stringify(speechSample.toString('base64'))}), character => character.charCodeAt(0));
      const context = window.previewTone.context;
      const speech = context.createBufferSource(); speech.buffer = await context.decodeAudioData(bytes.buffer); speech.loop = true;
      window.previewTone.disconnect(); speech.connect(window.previewGain); window.previewGain.gain.value = 0.8;
      speech.start(); window.previewSpeech = speech;
    })()`);
    await wait(1500); await capture('recording-speech');
    nativeTheme.themeSource = 'light'; await capture('recording-speech-light');
    await resize(360, 780); await capture('recording-speech-small'); await resize(1100, 820); nativeTheme.themeSource = 'dark';
    await win.webContents.executeJavaScript("document.querySelector('.app-container').scrollTop = 0");
    await win.webContents.executeJavaScript("window.previewSpeech.stop(); window.previewSpeech.disconnect(); window.previewTone.connect(window.previewGain); window.previewGain.gain.value = 0.2;");
    }
    await win.webContents.executeJavaScript('window.advancePreviewClock()'); await wait(300);
    await capture('recording');
    if (await stopPosition() !== readyStopPosition) throw new Error('Stop moved when recording started: ' + readyStopPosition + ' -> ' + await stopPosition());
    await resize(360, 780); await capture('recording-small'); await resize(1100, 820);
    nativeTheme.themeSource = 'light'; await wait(200); await capture('recording-light'); nativeTheme.themeSource = 'dark';
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await wait(300); await capture('recording-reduced-motion');
    if (await win.webContents.executeJavaScript("document.querySelector('.spectrum-display').getAttribute('data-mode')") !== 'bars-reduced-motion') throw new Error('Reduced motion still scrolls the spectrum');
    await win.webContents.executeJavaScript("window.previewGain.gain.value = 0"); await wait(350); await capture('recording-reduced-motion-quiet');
    if (!await win.webContents.executeJavaScript("(() => { const canvas = document.querySelector('app-audio-spectrum canvas'); return !canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0); })()")) throw new Error('Reduced-motion bars retained stale audio in silence');
    await win.webContents.executeJavaScript("window.previewGain.gain.value = 0.2");
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    await wait(400);
    await win.webContents.executeJavaScript("window.previewGain.gain.value = 0"); await wait(500); await capture('recording-quiet');
    if (!await win.webContents.executeJavaScript("(() => { const canvas = document.querySelector('app-audio-spectrum canvas'); const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; return !pixels.some((value, index) => index % 4 === 3 && value > 0); })()")) throw new Error('Frequency bars did not settle to silence');
    if (!await win.webContents.executeJavaScript("document.querySelector('.workflow-status h3').textContent.includes('Recording') && document.querySelector('.local-badge').textContent.includes('Recording') && !document.querySelector('.spectrum-label')")) throw new Error('Quiet input lost the main recording status or retained a redundant spectrum label');
    await win.webContents.executeJavaScript("window.previewGain.gain.value = 0.2");
    await win.webContents.executeJavaScript(`(() => {
      if (document.querySelector('#app-tab-models').disabled || document.querySelector('#app-tab-history').disabled) throw new Error('Main views unnecessarily locked during recording');
      document.querySelector('#app-tab-transcription').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      if (document.querySelector('#app-panel-history').hidden) throw new Error('Keyboard navigation cannot inspect History during recording');
      if (!document.querySelector('.local-badge').textContent.includes('Recording')) throw new Error('Header recording status is missing');
    })()`);
    await capture('history-during-recording');
    await click('#app-tab-transcription');
    if (!await win.webContents.executeJavaScript("!document.querySelector('[data-action=stop]').disabled && document.querySelector('#audio-file-tab').disabled && !document.querySelector('#record-audio-tab').disabled && !document.querySelector('#source-help') && document.querySelector('#workflow-help').textContent.includes('switch audio source')")) throw new Error('Recording or source guard lost after navigating back');
    await click('[data-action="stop"]'); await capture('processing');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    if (await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('.status-spinner')).animationName") !== 'none') throw new Error('Reduced motion preference was ignored');
    await capture('processing-reduced-motion');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    await wait(1000);
    await capture('result');
    await click('label[for=export-format]');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await capture('export-format-focus');
    if (await win.webContents.executeJavaScript("document.querySelector('#export-format').value") !== 'srt') throw new Error('Keyboard format selection failed');
    await click('[data-action=save]'); await wait(200);
    if (savedFormats.at(-1) !== 'srt') throw new Error('Selected export format did not reach IPC');
    await capture('export-saved');
    // Use the production preload bridge and Candor alert dialog for overwrite decisions.
    const askOverwrite = async (name) => {
      await win.webContents.executeJavaScript("document.querySelector('[data-action=save]').focus()");
      const response = new Promise(resolve => ipcMain.once('transcript-overwrite-response', (_event, id, replace) => resolve({ id, replace })));
      win.webContents.send('transcript-overwrite-request', { requestId: name, filePath: '/home/tester/Documents/interview recordings/long folder name/answer.json' });
      await wait(180);
      return { response };
    };
    let overwrite = await askOverwrite('cancel');
    await capture('overwrite-dark');
    if (!await win.webContents.executeJavaScript("document.querySelector('.overwrite-modal').shadowRoot.querySelector('dialog[role=alertdialog]').matches(':modal') && document.activeElement.textContent.trim() === 'Cancel'")) throw new Error('Overwrite dialog lacks modal semantics or safe initial focus');
    await win.webContents.debugger.sendCommand('Accessibility.enable');
    const ax = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    if (!ax.nodes.some(node => node.role?.value === 'alertdialog' && node.name?.value === 'Replace existing transcript?')) throw new Error('Overwrite prompt missing from accessibility tree');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    if ((await overwrite.response).replace !== false) throw new Error('Escape did not cancel replacement');
    await wait(100);
    if (!await win.webContents.executeJavaScript("document.activeElement.matches('[data-action=save]')")) throw new Error('Overwrite dialog did not restore Save focus');
    await resize(428, 620); nativeTheme.themeSource = 'light';
    overwrite = await askOverwrite('replace'); await capture('overwrite-small-light');
    await click('[data-action=replace]');
    if ((await overwrite.response).replace !== true) throw new Error('Replace did not reach main process');
    nativeTheme.themeSource = 'dark'; await resize(1100, 820);
    for (let index = 0; index < 6; index++) { await click('[data-action=save]'); await wait(80); }
    await resize(428, 620); await capture('export-notifications-428');
    if (!await win.webContents.executeJavaScript("(() => { const dock = document.querySelector('.toast-container').getBoundingClientRect(); const content = document.querySelector('.app-container').getBoundingClientRect(); const header = document.querySelector('.app-header').getBoundingClientRect(); return dock.top >= header.bottom - 1 && dock.bottom <= content.top + 1 && dock.height <= innerHeight * .25 + 1 && document.documentElement.scrollWidth <= innerWidth; })()")) throw new Error('Notifications overlap the workflow or header at 428px');
    await resize(360, 360); await capture('export-notifications-short');
    if (!await win.webContents.executeJavaScript("getComputedStyle(document.body).overflow === 'hidden' && document.querySelector('.app-header').getBoundingClientRect().top === 0")) throw new Error('Short window moved the header into a competing document scroller');
    await resize(1100, 820);
    await win.webContents.executeJavaScript("Promise.all([...document.querySelectorAll('candor-toast')].map(async el => { await el.updateComplete; el.shadowRoot.querySelector('[aria-label=Dismiss]')?.click(); }))");
    win.webContents.send('transcription-completed', { ...fixture, alignmentWarning: 'Some word boundaries could not be aligned precisely.', speechDetectionWarning: 'Speech detection was unavailable for this recording.' });
    await win.webContents.executeJavaScript("document.querySelector('.result-section').scrollIntoView({ block: 'start' })"); await capture('transcript-warnings');
    if (!await win.webContents.executeJavaScript("!document.querySelector('.timing-details').open && [...document.querySelectorAll('.transcript-content [role=status]')].filter(el => el.checkVisibility()).length === 2")) throw new Error('Warnings are hidden behind transcript details');
    win.webContents.send('transcription-completed', fixture); await wait(80);
    if (!await win.webContents.executeJavaScript("document.querySelector('[data-action=record]').textContent.includes('Record another') && !document.querySelector('#source-help') && !document.querySelector('#record-audio-tab').hasAttribute('aria-describedby')")) throw new Error('Completed recording lacks repeat action or retains idle filler');
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
    await resize(480, 820); await capture('result-narrow');
    await resize(360, 780); await capture('result-small');
    win.webContents.send('transcription-completed', { ...fixture, segments: Array.from({ length: 60 }, (_, i) => ({ start: i * 2, end: i * 2 + 1, text: 'A longer transcript exercises native scrolling and focus.' })) });
    await wait(100); await checkScrollbar('.transcript-view'); await capture('scrollbar-transcript-dark');
    nativeTheme.themeSource = 'light'; await wait(350); await checkScrollbar('.transcript-view'); await capture('scrollbar-transcript-light');
    nativeTheme.themeSource = 'dark'; win.webContents.send('transcription-completed', fixture); await wait(100);
    if (!await win.webContents.executeJavaScript("!document.querySelector('.timing-details').open && document.querySelector('.transcript-heading').textContent.trim() === 'Your transcript'")) throw new Error('Transcript header still contains technical metadata or details start open');
    await click('.timing-details >>> button');
    await win.webContents.executeJavaScript("document.querySelector('.transcript-metadata').scrollIntoView({ block: 'center' })");
    await capture('transcript-details-small');
    await click('.timing-details >>> button');
    await resize(1100, 820);
    await win.webContents.executeJavaScript("document.querySelector('.disclosure--inline').shadowRoot.querySelector('button').focus(); document.querySelector('.disclosure--inline').scrollIntoView({ block: 'center' })");
    if (!await win.webContents.executeJavaScript("!!document.querySelector('.transcript-output').shadowRoot.querySelector('.card__footer:not([hidden])') && document.querySelector('.disclosure--inline').parentElement.slot === 'footer'")) throw new Error('Timing disclosure is not in the Card footer');
    await capture('timing-disclosure-focus');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    if (!await win.webContents.executeJavaScript("document.querySelector('.disclosure--inline').open")) throw new Error('Timing disclosure keyboard toggle failed');
    await capture('timing-disclosure-open');
    await win.webContents.executeJavaScript("document.querySelector('.transcript-metadata').scrollIntoView({ block: 'start' })"); await capture('transcript-details');
    nativeTheme.themeSource = 'light'; await capture('transcript-details-light');
    nativeTheme.themeSource = 'dark';
    await win.webContents.executeJavaScript("document.querySelectorAll('.quiet-details').forEach(el => el.open = true); document.querySelector('.quiet-details').scrollIntoView({ block: 'start' })");
    await capture('nested-diagnostics');
    await resize(360, 780);
    await wait(150);
    await win.webContents.executeJavaScript("document.querySelector('.quiet-details').scrollIntoView({ block: 'start' })");
    await capture('nested-diagnostics-small');
    await win.webContents.executeJavaScript("document.querySelector('.disclosure--subtle').scrollIntoView({ block: 'start' })");
    await capture('nested-rows-small');
    await resize(1100, 820); nativeTheme.themeSource = 'light'; await wait(350); await capture('nested-diagnostics-light');
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
    await click('[data-action=settings]');
    await capture('settings');
    if (!await win.webContents.executeJavaScript("document.querySelector('.settings-modal').shadowRoot.querySelector('dialog').matches(':modal') && document.activeElement === document.querySelector('#model-select')")) throw new Error('Settings did not open as a modal with initial model focus');
    for (let index = 0; index < 7; index++) {
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      if (!await win.webContents.executeJavaScript("(() => { const modal = document.querySelector('.settings-modal'); let active = document.activeElement; while (active.shadowRoot?.activeElement) active = active.shadowRoot.activeElement; return modal.contains(active) || modal.shadowRoot.contains(active); })()")) throw new Error('Tab escaped the settings modal at ' + index + ': ' + await win.webContents.executeJavaScript("(() => { let active = document.activeElement; while (active.shadowRoot?.activeElement) active = active.shadowRoot.activeElement; return JSON.stringify({ tag: active.tagName, id: active.id, className: active.className, dialog: document.querySelector('.settings-modal').shadowRoot.querySelector('dialog').open }); })()"));
    }
    await win.webContents.executeJavaScript("document.querySelector('.settings-modal').shadowRoot.querySelector('dialog button').focus()");
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
    if (!await win.webContents.executeJavaScript("document.activeElement === document.querySelector('.settings-modal [slot=footer] button')")) throw new Error('Reverse Tab did not wrap inside settings');
    await win.webContents.executeJavaScript("document.querySelector('#model-select').classList.add('input--error'); document.querySelector('#model-select').focus()");
    await capture('input-error-focus');
    await win.webContents.executeJavaScript("document.querySelector('#model-select').classList.remove('input--error')");
    await resize(360, 780);
    await win.webContents.executeJavaScript("document.querySelector('.settings-modal .options-section').scrollIntoView({ block: 'center' })");
    await capture('settings-small');
    await resize(480, 420); await capture('settings-short');
    win.webContents.setZoomFactor(2); await capture('settings-zoom');
    if (!await win.webContents.executeJavaScript("(() => { const r = document.querySelector('.settings-modal [slot=footer] button').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; })()")) throw new Error('Zoom clips the modal closing action');
    win.webContents.setZoomFactor(1);
    await resize(1100, 820);
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await wait(80);
    if (!await win.webContents.executeJavaScript("!document.querySelector('.settings-modal').open && document.activeElement.matches('[data-action=settings]')")) throw new Error('Escape did not restore settings trigger focus');
    await click('[data-action=settings]'); await capture('settings-reopened');
    await win.webContents.executeJavaScript("document.querySelector('.app-container').scrollTop = 0");
    await win.webContents.executeJavaScript("document.querySelector('.settings-modal [slot=footer] button').click()");
    await win.webContents.executeJavaScript("window.RealAudioContext = window.AudioContext; window.AudioContext = class extends window.RealAudioContext { createMediaStreamSource() { throw new Error('Fixture analysis failure'); } }; void 0");
    await click('[data-action="record"]'); await capture('starting-again'); await waitForRecording();
    await capture('recording-display-unavailable');
    await resize(360, 780); await capture('recording-display-unavailable-small'); await resize(1100, 820);
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
    nativeTheme.themeSource = 'light'; await wait(250); await capture('file-empty-light'); nativeTheme.themeSource = 'dark';
    failPicker = true; await click('[data-action="choose-file"]'); await wait(100); await capture('candor-toast');
    if (!await win.webContents.executeJavaScript("document.querySelector('candor-toast-container').shadowRoot.querySelector('.live--assertive').textContent.includes('Failed to select file')")) throw new Error('Toast was not added to the persistent assertive region');
    await resize(360, 780); await capture('candor-toast-small'); await resize(1100, 820);
    nativeTheme.themeSource = 'light'; await wait(350); await capture('candor-toast-light'); nativeTheme.themeSource = 'dark'; await wait(350);
    await win.webContents.executeJavaScript("document.querySelector('candor-toast').shadowRoot.querySelector('[aria-label=Dismiss]').click()");
    if (await win.webContents.executeJavaScript("!!document.querySelector('candor-toast')")) throw new Error('Dismiss did not remove the toast');
    await click('[data-action="choose-file"]'); await wait(100); await capture('file-selected');
    if (!await win.webContents.executeJavaScript("document.querySelector('[data-action=choose-file]').closest('.step-card').querySelector('.file-name').textContent === 'interview-answer.wav' && document.querySelector('.file-info').textContent.includes('5 MB') && !document.querySelector('.record-actions .file-info')")) throw new Error('Selected file is not grouped with its Choose action');
    nativeTheme.themeSource = 'light'; await wait(250); await capture('file-selected-light'); nativeTheme.themeSource = 'dark';
    await resize(360, 780); await capture('file-selected-small'); await resize(1100, 820);
    filename = 'Research-interview-session-about-complex-decisions-and-unclear-expectations-with-detailed-follow-up-notes-2026-10-24.wav';
    await click('[data-action="choose-file"]'); await wait(100);
    await resize(360, 780); await capture('file-long-name'); await resize(1100, 820);
    nativeTheme.themeSource = 'light'; await wait(250); await capture('file-long-name-light'); nativeTheme.themeSource = 'dark';
    await click('[data-action="transcribe"]'); await capture('file-processing'); await wait(1000);
    if (!await win.webContents.executeJavaScript("document.querySelector('[data-action=choose-file]').closest('.step-card').querySelector('.file-name').textContent.includes('Research-interview')")) throw new Error('Transcription lost selected-file context');
    await capture('file-result');
    if (!await win.webContents.executeJavaScript("document.querySelector('[data-action=choose-file]').textContent.includes('Choose another file')")) throw new Error('File result does not offer another file');
    await click('#record-audio-tab');
    if (await win.webContents.executeJavaScript("!!document.querySelector('.record-actions [data-action=transcribe]')")) throw new Error('Retry is visible after success');
    nativeTheme.themeSource = 'light'; await wait(200); await capture('result-light');
    await win.webContents.executeJavaScript("document.querySelector('[data-action=settings]').click(); document.querySelector('#model-select').classList.add('input--error'); document.querySelector('#model-select').focus(); document.querySelector('#model-select').scrollIntoView({ block: 'center' })");
    await capture('input-error-focus-light');
    await win.webContents.executeJavaScript("document.querySelector('#model-select').classList.remove('input--error'); document.querySelector('.settings-modal [slot=footer] button').click(); document.querySelector('.app-container').scrollTop = 0");
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
    const modelOrder = () => win.webContents.executeJavaScript("[...document.querySelectorAll('.models-page tbody tr')].map(row => row.dataset.model)");
    const sortPoint = await win.webContents.executeJavaScript("(() => { const r=document.querySelector('[data-sort=name]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()");
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...sortPoint });
    await capture('models-sort-hover');
    await click('[data-sort=size]'); await capture('models-sort-size');
    if (JSON.stringify(await modelOrder()) !== JSON.stringify(['tiny','base','small','large-v3-turbo-q5_0','parakeet-tdt-0.6b-v3','medium','large'])) throw new Error('Size sorting is not numeric');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    if ((await modelOrder())[0] !== 'large') throw new Error('Enter did not reverse size sorting');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await capture('models-sort-keyboard');
    if (!await win.webContents.executeJavaScript("document.activeElement === document.querySelector('[data-sort=size]') && document.activeElement.matches(':focus-visible') && document.querySelectorAll('th[aria-sort]').length === 1 && document.querySelector('[data-sort=size]').closest('th').getAttribute('aria-sort') === 'ascending'")) throw new Error('Sort focus or aria-sort was lost');
    await click('[data-sort=speed]'); await capture('models-sort-speed');
    if ((await modelOrder())[0] !== 'tiny') throw new Error('Speed sorting did not start fastest first');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await win.webContents.executeJavaScript("[...document.querySelectorAll('#app-panel-models tbody button')].at(-2).focus()");
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    if (!await win.webContents.executeJavaScript("document.activeElement === [...document.querySelectorAll('.model-repository a')].at(-1) && document.activeElement.matches(':focus-visible')")) throw new Error('Repository link is not in the native keyboard sequence');
    await capture('models-repository-focus');
    await win.webContents.executeJavaScript("document.querySelector('#app-tab-models').focus()");
    await win.webContents.executeJavaScript("document.querySelector('.app-container').scrollTop = 0");
    await win.webContents.executeJavaScript("document.querySelector('.models-page tbody tr:last-child').scrollIntoView({ block: 'center' })");
    await capture('models-added');
    await win.webContents.executeJavaScript("document.querySelector('.models-page .info-alert').scrollIntoView({ block: 'end' })");
    await capture('models-guidance');
    await win.webContents.executeJavaScript("document.querySelector('.app-container').scrollTop = 0");
    nativeTheme.themeSource = 'light'; await wait(350); await capture('models-light');
    const hoverModel = async selector => {
      const point = await win.webContents.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await wait(250); return point;
    };
    await hoverModel('#app-panel-models tbody tr:nth-child(2) .model-repository a');
    await capture('models-repository-hover-light');
    let modelButtonPoint = await hoverModel('#app-panel-models tbody tr:nth-child(4) button');
    await capture('models-download-hover-light');
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...modelButtonPoint });
    await capture('models-download-active-light');
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 200 });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: 10, y: 200 });
    nativeTheme.themeSource = 'dark'; await wait(350);
    await hoverModel('#app-panel-models tbody tr:nth-child(2) .model-repository a');
    await capture('models-repository-hover-dark');
    modelButtonPoint = await hoverModel('#app-panel-models tbody tr:nth-child(4) button');
    await capture('models-download-hover-dark');
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...modelButtonPoint });
    await capture('models-download-active-dark');
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 200 });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: 10, y: 200 });
    await resize(360, 780); await capture('models-small');
    await checkScrollbar('#app-panel-models .table-container', true); await capture('scrollbar-models-dark');
    await win.webContents.executeJavaScript("document.querySelector('#app-panel-models .table-container').scrollLeft = 300");
    await capture('models-metrics-small');
    await win.webContents.executeJavaScript("document.querySelector('#app-panel-models .table-container').scrollLeft = 0");
    await win.webContents.executeJavaScript("document.querySelector('.models-page .info-alert').scrollIntoView({ block: 'end' })");
    await capture('models-guidance-small');
    await resize(480, 780);
    await win.webContents.executeJavaScript("document.querySelector('.app-container').scrollTop = 0");
    await capture('models-narrow');
    await win.webContents.executeJavaScript("[...document.querySelectorAll('#app-panel-models .button')].at(-1).focus()");
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    if (!await win.webContents.executeJavaScript("document.activeElement === document.querySelector('#model-benchmark-context a') && document.activeElement.matches(':focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth) > 0")) throw new Error('Benchmark source link lacks visible keyboard focus');
    await capture('models-benchmark-focus');
    if (!await win.webContents.executeJavaScript("document.querySelector('#app-panel-models .table-container').tabIndex === 0")) throw new Error('Overflowing table is not keyboard reachable');
    await resize(1100, 820); await wait(150);
    if (await win.webContents.executeJavaScript("document.querySelector('#app-panel-models .table-container').hasAttribute('tabindex')")) throw new Error('Fitting table adds an unnecessary tab stop');
    await click('#app-panel-models [data-model=tiny] .button'); await capture('model-download');
    if (!await win.webContents.executeJavaScript("document.querySelector('#app-panel-models [role=progressbar]').getAttribute('aria-label').includes('tiny')")) throw new Error('Download progress lacks a model label');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await capture('model-download-reduced-motion');
    if (!await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('#app-panel-models .progress-bar__fill')).animationName === 'none'")) throw new Error('Download progress ignores reduced motion');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    finishDownload(); await wait(300);
    await win.webContents.executeJavaScript("Promise.all([...document.querySelectorAll('candor-toast')].map(async el => { await el.updateComplete; el.shadowRoot.querySelector('[aria-label=Dismiss]')?.click(); }))");
    await click('#app-tab-history'); await capture('history');
    history = [{ id: 'fixture', status: 'completed', fileName: 'Recorded answer', options: { model: 'base' }, audioDuration: 38.6, transcriptionTime: 1450, startedAt: '2026-10-24T21:30:00.000Z', result: fixture }];
    await click('#app-panel-history [aria-label="Refresh history"]'); await wait(100); await capture('history-populated');
    history = [...history,
      { id: 'waiting', status: 'processing', fileName: 'Answer in progress', startedAt: '2026-10-24T21:31:00.000Z' },
      { id: 'failed', status: 'failed', fileName: 'Failed answer', startedAt: '2026-10-24T21:32:00.000Z' },
      { id: 'missing', status: 'completed', fileName: 'Result unavailable', startedAt: '2026-10-24T21:33:00.000Z' },
      { id: 'pending', status: 'pending', fileName: 'Queued answer', startedAt: '2026-10-24T21:34:00.000Z' },
      { id: 'cancelled', status: 'cancelled', fileName: 'Cancelled answer', startedAt: '2026-10-24T21:35:00.000Z' }];
    historyDelay = 1000;
    await click('#app-panel-history [aria-label="Refresh history"]'); await capture('history-refreshing');
    if (!await win.webContents.executeJavaScript("document.querySelector('#app-panel-history [aria-label=\"Refresh history\"]').disabled && document.querySelector('#history-refresh-status').textContent.includes('Refreshing')")) throw new Error('Disabled Refresh lacks visible reason');
    await wait(850); historyDelay = 0; await capture('history-unavailable');
    if (!await win.webContents.executeJavaScript("[...document.querySelectorAll('.history-action button:disabled')].length === 5 && [...document.querySelectorAll('.history-action button:disabled')].every(el => !!document.getElementById(el.getAttribute('aria-describedby'))?.textContent)")) throw new Error('Disabled history actions lack adjacent reasons');
    if (!await win.webContents.executeJavaScript("['check-circle', 'waveform', 'x-circle', 'check-circle', 'hourglass', 'prohibit'].every((glyph, index) => document.querySelectorAll('#app-panel-history tbody .status-text i')[index].classList.contains('ph-' + glyph))")) throw new Error('History states do not have distinct outcome shapes');
    await click('[data-history-sort=date]'); await capture('history-sort-date');
    if (!await win.webContents.executeJavaScript("document.querySelector('#app-panel-history tbody tr').dataset.historyId === 'cancelled' && document.querySelectorAll('#app-panel-history th[aria-sort]').length === 1")) throw new Error('History date sorting failed');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await capture('history-sort-keyboard');
    if (!await win.webContents.executeJavaScript("document.querySelector('#app-panel-history tbody tr').dataset.historyId === 'fixture' && document.activeElement.matches('[data-history-sort=date]:focus-visible')")) throw new Error('History keyboard sort/focus failed');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    if (!await win.webContents.executeJavaScript("document.querySelector('#app-panel-history tbody tr').dataset.historyId === 'cancelled'")) throw new Error('History Space did not sort');
    await click('[data-history-sort=date]');
    await win.webContents.executeJavaScript("document.querySelector('#app-panel-history tbody tr:last-child').scrollIntoView({ block: 'nearest' })");
    await capture('history-outcome-shapes');
    await win.webContents.executeJavaScript("document.querySelector('#app-panel-history').scrollIntoView({ block: 'start' })");
    await resize(360, 780); await capture('history-unavailable-small');
    await wait(150);
    await win.webContents.executeJavaScript("const historyScroll = document.querySelector('#app-panel-history .table-container'); historyScroll.scrollLeft = historyScroll.scrollWidth; void 0");
    await capture('history-actions-small');
    nativeTheme.themeSource = 'light'; await wait(250); await capture('history-actions-small-light');
    nativeTheme.themeSource = 'dark'; await resize(1100, 820);
    await win.webContents.executeJavaScript("document.querySelector('#app-panel-history .table-container').scrollLeft = 0");
    await win.webContents.executeJavaScript("document.querySelector('#app-tab-history').focus(); document.querySelector('#app-panel-history [aria-label=\"Refresh history\"]').focus()");
    await capture('candor-tooltip-focus');
    if (!await win.webContents.executeJavaScript("(() => { const host = document.querySelector('#app-panel-history candor-tooltip'); const bubble = host.shadowRoot.querySelector('.tooltip__bubble'); return bubble.matches(':popover-open') && bubble.getAttribute('aria-hidden') === 'true' && host.querySelector('button').getAttribute('aria-describedby') === 'history-refresh-status'; })()")) throw new Error('Candor tooltip contract failed');
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
    await resize(360, 780); await capture('history-small');
    await checkScrollbar('#app-panel-history .table-container', true); await capture('scrollbar-history-dark');
    // A build without the alternate runtime loads its own initial capability catalog.
    alternateReady = false; await resize(1100, 820); nativeTheme.themeSource = 'dark';
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
    await wait(500); await click('#app-tab-models');
    await win.webContents.executeJavaScript("document.querySelector('.models-page [data-model=\"parakeet-tdt-0.6b-v3\"]').scrollIntoView({ block: 'center' })");
    await capture('models-runtime-unavailable');
    if (!await win.webContents.executeJavaScript("document.querySelector('.models-page [data-model=\"parakeet-tdt-0.6b-v3\"] button').disabled")) throw new Error('Unavailable engine offers an unusable download');
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
    const accessibility = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    const themeRadios = accessibility.nodes.filter(node => !node.ignored && node.role?.value === 'radio');
    const themeGroup = accessibility.nodes.find(node => !node.ignored && node.role?.value === 'radiogroup' && node.name?.value === 'Theme');
    if (!themeGroup || themeRadios.length !== 3 || !['Light', 'Dark', 'System'].every(name => themeRadios.some(node => node.name?.value === name))) throw new Error('Theme group/options lack real accessibility-tree names');
    if (!themeRadios.find(node => node.name.value === 'System').description?.value?.includes('appearance of your device')) throw new Error('System option does not describe its automatic appearance behavior');
    const checkedRadios = themeRadios.filter(node => node.properties?.some(property => property.name === 'checked' && String(property.value.value) === 'true'));
    if (checkedRadios.length !== 1 || checkedRadios[0].name.value !== 'System') throw new Error('Theme checked state is missing from the accessibility tree');
    await fs.writeFile(path.join(output, 'theme-accessibility.json'), JSON.stringify({ group: themeGroup.name.value, radios: themeRadios.map(node => ({ name: node.name.value, description: node.description?.value, properties: node.properties })) }, null, 2));
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
    const themeBubbleVisible = () => win.webContents.executeJavaScript("document.querySelector('#theme-control input[value=system]').closest('candor-tooltip').shadowRoot.querySelector('.tooltip__bubble').matches(':popover-open')");
    if (!await themeBubbleVisible()) throw new Error('Theme tooltip is unavailable on radio focus');
    await themeKey('Escape', 27);
    if (await themeBubbleVisible()) throw new Error('Escape did not dismiss theme tooltip');
    await resize(360, 780); await capture('theme-small');
    await win.webContents.executeJavaScript("document.querySelector('#app-tab-transcription').focus()");
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 200 }); await wait(100);
    const themePoint = await win.webContents.executeJavaScript("(() => { const r = document.querySelector('#theme-control input[value=system]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()");
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...themePoint });
    await wait(200); await capture('theme-tooltip-small');
    if (!await themeBubbleVisible()) throw new Error('Theme tooltip is unavailable on hover');
    const themeBubblePoint = await win.webContents.executeJavaScript("(() => { const bubble = document.querySelector('#theme-control input[value=system]').closest('candor-tooltip').shadowRoot.querySelector('.tooltip__bubble'); const r=bubble.getBoundingClientRect(); if (bubble.getAttribute('aria-hidden') !== 'true' || r.left<0 || r.right>innerWidth || r.top<0 || r.bottom>innerHeight || document.querySelector('#theme-control input[value=system]').hasAttribute('aria-describedby')) throw new Error('Theme tooltip contract/placement failed'); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()");
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...themeBubblePoint }); await wait(100);
    if (!await themeBubbleVisible()) throw new Error('Theme tooltip disappears on pointer entry');
    await resize(1100, 820); alternateReady = true;
    await click('#app-tab-models');
    await click('[data-model=base] [data-model-action]'); await capture('model-deleting');
    await wait(600); await capture('model-deleted');
    if (!await win.webContents.executeJavaScript("document.querySelector('[data-model=base] [data-model-action]').textContent.includes('Download') && document.activeElement === document.querySelector('[data-model=base] [data-model-action]')")) throw new Error('Delete did not restore Download with focus');
    installedModels.add('parakeet-tdt-0.6b-v3');
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); }); await wait(350);
    await win.webContents.executeJavaScript("document.querySelector('[data-action=settings]').click(); const select = document.querySelector('#model-select'); select.value = 'parakeet-tdt-0.6b-v3'; select.dispatchEvent(new Event('change', { bubbles: true }));");
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); }); await wait(350);
    if (!await win.webContents.executeJavaScript("document.querySelector('#model-select').value === 'parakeet-tdt-0.6b-v3'")) throw new Error('Model preference was not restored');
    await click('[data-action=settings]'); await capture('model-preference-restored'); await click('.settings-modal [slot=footer] button');
    await click('#app-tab-models');
    failDelete = true; await click('[data-model="parakeet-tdt-0.6b-v3"] [data-model-action]'); await wait(600); await capture('model-delete-failed');
    if (!await win.webContents.executeJavaScript("document.querySelector('[data-model=\"parakeet-tdt-0.6b-v3\"] [data-model-action]').textContent.includes('Delete')")) throw new Error('Failed deletion lost installed status');
    deletionBlocked = true;
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); }); await wait(350);
    await click('#app-tab-models'); await capture('model-delete-blocked');
    if (!await win.webContents.executeJavaScript("document.querySelector('[data-model=\"parakeet-tdt-0.6b-v3\"] [data-model-action]').disabled && document.getElementById('model-action-status').textContent.includes('Finish transcription')")) throw new Error('Blocked deletion lacks a visible reason');
    nativeTheme.themeSource = 'light'; await wait(250); await resize(360, 780);
    await win.webContents.executeJavaScript("const scroller = document.querySelector('.models-page .table-container'); scroller.scrollLeft = scroller.scrollWidth;");
    await capture('model-delete-blocked-small-light');
    await fs.writeFile(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.log('Visual review:', output);
    clearTimeout(watchdog);
    app.quit();
  } catch (error) { clearTimeout(watchdog); console.error(error); app.exit(1); }
});
app.on('will-quit', () => { void fs.rm(profile, { recursive: true, force: true }).catch(() => {}); });
