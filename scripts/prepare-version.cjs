// Stage synchronized versions only. Commit/tagging belongs after validation.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { syncVersions } = require('./sync-version');

function prepareVersion(bump, root = process.cwd()) {
  if (!['patch', 'minor', 'major'].includes(bump)) throw new Error('Choose patch, minor or major.');
  const current = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!parts) throw new Error('For prereleases, choose the explicit version using the release procedure.');
  const [major, minor, patch] = parts.slice(1).map(Number);
  const next = bump === 'major' ? `${major + 1}.0.0` : bump === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
  const updated = syncVersions(root, next);
  return { version: next, updated };
}

module.exports = { prepareVersion };
if (require.main === module) {
  try {
    if (execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim() !== 'main') throw new Error('Prepare final release versions on main after merging feature work.');
    console.log(prepareVersion(process.argv[2]));
    console.log('Versions staged; no commit or tag created. Validate and review before tagging.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
