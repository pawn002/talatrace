// Run with Node against the actual packaged EXE. Inspector injection isolates appData
// before application code runs; no production test hook or real user profile is used.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const executable = path.resolve(process.argv[2] || 'release/talatrace-rc1/win-unpacked/TalaTrace.exe');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function launch(appData, expectedProfile, recognize = false, preferencesExist = false, options = {}) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, ['--inspect-brk=127.0.0.1:0'], { windowsHide: true, env });
  let diagnostics = '';
  child.stdout.on('data', () => {});
  let socket;
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Packaged inspector did not start')), 15000);
      child.stderr.on('data', data => {
        diagnostics = (diagnostics + data).slice(-12000);
        const match = diagnostics.match(/ws:\/\/127\.0\.0\.1:\d+\/[^\s]+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.once('error', reject);
    });
    socket = new WebSocket(url);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let id = 0;
    const pending = new Map();
    let onPaused;
    const paused = new Promise(resolve => { onPaused = resolve; });
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.method === 'Debugger.paused') onPaused(data.params);
      if (data.id && pending.has(data.id)) {
        const { resolve, reject, timer } = pending.get(data.id); clearTimeout(timer); pending.delete(data.id);
        data.error ? reject(new Error(JSON.stringify(data.error))) : resolve(data.result);
      }
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const request = ++id;
      const timer = setTimeout(() => { pending.delete(request); reject(new Error(method + ' timed out')); }, 120000);
      pending.set(request, { resolve, reject, timer }); socket.send(JSON.stringify({ id: request, method, params }));
    });
    await command('Debugger.enable'); await command('Runtime.runIfWaitingForDebugger');
    const breakpoint = await Promise.race([paused, wait(15000).then(() => { throw new Error('No entry breakpoint'); })]);
    const injected = await command('Debugger.evaluateOnCallFrame', {
      callFrameId: breakpoint.callFrames[0].callFrameId,
      expression: `(() => {
        const e = require('electron'); globalThis.__releaseElectron = e;
        e.app.setPath('appData', ${JSON.stringify(appData)});
        e.app.on('browser-window-created', (_event, win) => {
          win.hide(); win.webContents.setBackgroundThrottling(false);
          win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, done) => done({ cancel: true }));
        });
        return e.app.getPath('appData');
      })()`, returnByValue: true,
    });
    if (injected.exceptionDetails) throw new Error(JSON.stringify(injected.exceptionDetails));
    assert.equal(injected.result.value, appData);
    await command('Debugger.resume');
    const evaluate = async expression => {
      const value = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
      return value.result.value;
    };
    const renderer = expression => evaluate(`(async () => {
      const e = globalThis.__releaseElectron; await e.app.whenReady();
      let win; for(let i=0; i<100; i++) { win=e.BrowserWindow.getAllWindows()[0]; if(win) break; await new Promise(r=>setTimeout(r,50)); }
      if(!win) throw new Error('No packaged window');
      if(win.webContents.isLoading()) await new Promise(r=>win.webContents.once('did-finish-load',r));
      return win.webContents.executeJavaScript(${JSON.stringify(expression)});
    })()`);
    const identity = await evaluate(`(async () => { const {app}=globalThis.__releaseElectron; await app.whenReady(); return { packaged: app.isPackaged, name: app.getName(), version: app.getVersion(), profile: app.getPath('userData') }; })()`);
    assert.equal(identity.packaged, true); assert.equal(identity.name, 'TalaTrace'); assert.equal(identity.profile, expectedProfile);
    const models = await renderer('window.electronAPI.getAvailableModels()');
    const recognitionModels = options.models || ['base', 'parakeet-tdt-0.6b-v3'];
    for(const model of recognitionModels) {
      if(recognize) assert.ok(models.some(m=>m.name===model && m.installed && m.available), model + ' unavailable in package');
    }
    await renderer(`(async () => {
      for(let i=0;i<100 && !document.querySelector('#model-select option');i++) await new Promise(r=>setTimeout(r,50));
      if(${preferencesExist}) {
        if(localStorage.getItem('talatrace.model')!=='parakeet-tdt-0.6b-v3') throw new Error('Model preference lost on restart');
        if(document.querySelector('#model-select').value!=='parakeet-tdt-0.6b-v3') throw new Error('Saved model not selected');
      }
      if(${recognize && !options.keepPreference}) {
        const select=document.querySelector('#model-select'); select.value='parakeet-tdt-0.6b-v3'; select.dispatchEvent(new Event('change',{bubbles:true}));
      }
      return document.querySelector('h1, .app-title').textContent;
    })()`);
    const preferenceBefore = await renderer("localStorage.getItem('talatrace.model')");
    const results = [];
    if(recognize) for(const model of recognitionModels) {
      const result = await renderer(`(async () => await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Packaged recognition timed out')),90000);
        window.electronAPI.onTranscriptionCompleted(result=>{clearTimeout(timer);resolve(result)});
        window.electronAPI.onTranscriptionError(error=>{clearTimeout(timer);reject(new Error(error))});
        window.electronAPI.transcribeAudio(${JSON.stringify(path.join(root,'whisper.cpp/samples/jfk.wav'))},{model:${JSON.stringify(model)},language:'en',alignTimestamps:true,detectQuietIntervals:true}).then(result=>{if(!result.success){clearTimeout(timer);reject(new Error(result.error))}}).catch(reject);
      }))()`);
      assert.ok(result?.text?.toLowerCase().includes('country'), 'Packaged recognizer did not return the reference speech: ' + JSON.stringify(result));
      assert.ok(result.segments?.length && result.duration > 0 && result.processingTimeMs > 0);
      results.push({ model, engine: result.engine, seconds: result.duration, processingMs: result.processingTimeMs, segments: result.segments.length });
    }
    const preferenceAfter = await renderer("localStorage.getItem('talatrace.model')");
    assert.equal(preferenceAfter, preferenceBefore, 'Transcription unexpectedly changed the saved model');
    if(options.screenshot) {
      await renderer("(async () => { document.querySelector('#app-tab-models').click(); await document.fonts.ready; await new Promise(r=>setTimeout(r,350)); })()");
      const png = await evaluate("(async () => { const win=globalThis.__releaseElectron.BrowserWindow.getAllWindows()[0]; const image=await win.webContents.capturePage(); return image.toPNG().toString('base64'); })()");
      await fs.writeFile(options.screenshot, Buffer.from(png,'base64'));
    }
    console.log(JSON.stringify({ ...identity, models: models.filter(m=>m.installed).map(m=>m.name), preference: preferenceAfter, results }));
    // Inspector clients keep Node alive until detached; do not await app.quit through it.
    await command('Runtime.evaluate', { expression: 'setImmediate(()=>globalThis.__releaseElectron.app.quit()); true' });
  } catch(error) { throw new Error(error.message + '\n' + diagnostics); }
  finally { socket?.close(); if(child.exitCode===null) child.kill(); }
}

(async () => {
  if(process.argv.includes('--real-profile')) {
    // Explicit opt-in for a backed-up installed-app check. Keep existing preferences.
    const backup = (await fs.readFile(path.join(root,'.local-backups/active-upgrade-backup.txt'),'utf8')).trim();
    const manifest = JSON.parse(await fs.readFile(path.join(backup,'before.json'),'utf8'));
    assert.equal(manifest.Profile,path.join(process.env.APPDATA,'whisper-electron-app'));
    await launch(process.env.APPDATA,manifest.Profile,true,false,{ keepPreference:true,models:['tiny','parakeet-tdt-0.6b-v3'],screenshot:path.join(backup,'installed-models.png') });
    console.log('Installed upgrade: original profile, local engines and unchanged model preference passed.');
    return;
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'talatrace-package-smoke-'));
  // Deliberately retain this isolated directory for inspection; it contains hardlinks to local weights.
  console.log('Isolated package test:', directory);
  const legacy = path.join(directory, 'legacy', 'Whisper Transcription');
  await fs.mkdir(path.join(legacy,'models'), { recursive:true });
  for(const name of ['ggml-base.bin','parakeet-tdt-0.6b-v3-Q8_0.gguf']) await fs.link(path.join(root,'models',name),path.join(legacy,'models',name));
  await fs.writeFile(path.join(legacy,'.models-migrated'),'isolated-test');
  await fs.writeFile(path.join(legacy,'retention-marker.txt'),'preserve');
  await launch(path.dirname(legacy),legacy,true);
  await launch(path.dirname(legacy),legacy,false,true);
  assert.equal(await fs.readFile(path.join(legacy,'retention-marker.txt'),'utf8'),'preserve');
  const clean = path.join(directory,'clean'); await fs.mkdir(clean);
  await launch(clean,path.join(clean,'whisper-electron-app'));
  console.log('Packaged offline recognition, legacy profile retention, preference restart and clean launch passed. Installer upgrade/uninstall remains a separate check.');
})().catch(error=>{console.error(error);process.exitCode=1});
