const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { syncVersions } = require('../../scripts/sync-version');
const { prependChangelog, extractVersionSection } = require('../../scripts/release');

test('release version synchronization updates both lockfile roots without changing dependency versions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talatrace-version-'));
  try {
    for (const sub of ['', 'frontend']) {
      const dir = path.join(root, sub); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: sub || 'legacy-identity', version: '1.1.5' }));
      fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({ version: '0.0.0', packages: { '': { version: '0.0.0' }, 'node_modules/dependency': { version: '7.0.0', integrity: 'preserved' } } }));
    }
    assert.equal(syncVersions(root, '1.2.0').length, 4);
    for (const sub of ['', 'frontend']) {
      const dir = path.join(root, sub);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).version, '1.2.0');
      const lock = JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json')));
      assert.equal(lock.version, '1.2.0'); assert.equal(lock.packages[''].version, '1.2.0');
      assert.deepEqual(lock.packages['node_modules/dependency'], { version: '7.0.0', integrity: 'preserved' });
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).name, 'legacy-identity');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('release changelog moves curated notes out of Unreleased once and preserves older releases', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talatrace-changelog-'));
  const cwd = process.cwd();
  try {
    const old = '# Changelog\n\n## [Unreleased]\n\n### Added\n- Curated feature.\n\n## [1.1.5] - 2026-05-02\n\n- Older release.\n';
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), old); process.chdir(root);
    const notes = extractVersionSection(old, 'Unreleased').replace(/^## \[Unreleased\]\n/, '').trim();
    prependChangelog('## [1.2.0] - 2026-10-26\n\n' + notes, '1.2.0');
    const result = fs.readFileSync('CHANGELOG.md', 'utf8');
    assert.equal(extractVersionSection(result, 'Unreleased'), '## [Unreleased]');
    assert.match(extractVersionSection(result, '1.2.0'), /Curated feature/);
    assert.equal(extractVersionSection(result, '1.1.5'), extractVersionSection(old, '1.1.5'));
    prependChangelog('replacement', '1.2.0'); assert.equal(fs.readFileSync('CHANGELOG.md', 'utf8'), result);
  } finally { process.chdir(cwd); fs.rmSync(root, { recursive: true, force: true }); }
});
