const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { whisper } = require('./native-artifacts.cjs');

function ensureWhisperSource(root, run = execFileSync) {
  const source = path.join(root, 'whisper.cpp');
  const git = args => run('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!fs.existsSync(source)) git(['clone', '--depth', '1', '--branch', whisper.tag, whisper.repository, source]);
  const actual = git(['-C', source, 'rev-parse', 'HEAD']);
  if (actual !== whisper.commit) throw new Error(`Expected Whisper ${whisper.tag} (${whisper.commit}), found ${actual}. Existing work was not reset.`);
  if (git(['-C', source, 'status', '--porcelain', '--untracked-files=no'])) throw new Error('Whisper has tracked local changes; preserve them before building the pinned runtime.');
  return actual;
}
module.exports = { ensureWhisperSource };
