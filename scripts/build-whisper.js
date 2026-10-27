// Compatibility command: build into the current app's CPU runtime layout.
const path = require('node:path');
const { execFileSync } = require('node:child_process');
execFileSync(process.execPath, process.platform === 'linux' ? [path.join(__dirname, 'build-whisper-linux.cjs'), ...process.argv.slice(2)] : [path.join(__dirname, 'build-whisper-variants.js'), '--variant=baseline', ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
