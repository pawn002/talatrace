// Explicit test-only downloads; never runs as part of launching the app.
const path = require('node:path');
const { ModelStore } = require('../dist/electron/services/model-store');
const { speechModel } = require('../dist/electron/services/model-catalog');
const store = new ModelStore(path.resolve(__dirname, '../models'));
(async () => {
  for (const name of ['base', 'parakeet-tdt-0.6b-v3']) {
    if (!await store.installed(speechModel(name))) await store.download(name);
    console.log('Verified smoke model:', name);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
