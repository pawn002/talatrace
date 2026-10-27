const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { syncVersions } = require('../../scripts/sync-version');
const { prependChangelog, extractVersionSection, findArtifacts, packagingArguments } = require('../../scripts/release');
const { prepareVersion } = require('../../scripts/prepare-version.cjs');
const { execFileSync } = require('node:child_process');

test('version shortcuts synchronize metadata without moving HEAD or creating tags', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talatrace-stage-version-'));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
  try {
    for (const sub of ['', 'frontend']) {
      fs.mkdirSync(path.join(root, sub), { recursive: true });
      fs.writeFileSync(path.join(root, sub, 'package.json'), JSON.stringify({ version: '1.2.0' }));
      fs.writeFileSync(path.join(root, sub, 'package-lock.json'), JSON.stringify({ version: '1.2.0', packages: { '': { version: '1.2.0' } } }));
    }
    git(['init', '--initial-branch=main']); git(['add', '.']);
    git(['-c','user.name=Test','-c','user.email=test@example.test','-c','commit.gpgsign=false','commit','-m','baseline']);
    git(['-c','tag.gpgSign=false','tag','v1.2.0']);
    const head = git(['rev-parse','HEAD']), tags = git(['tag']);
    assert.equal(prepareVersion('patch', root).version, '1.2.1');
    assert.equal(git(['rev-parse','HEAD']), head); assert.equal(git(['tag']), tags);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'frontend/package-lock.json'))).packages[''].version,'1.2.1');
    assert.throws(() => prepareVersion('invalid', root), /Choose/);
    fs.writeFileSync(path.join(root,'frontend/package-lock.json'),'invalid JSON');
    assert.throws(() => prepareVersion('minor', root), SyntaxError);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,'1.2.1','Invalid lockfile must not leave a partial version bump');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('artifact discovery handles nested/custom output without uploading runtimes, backups or other versions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talatrace-artifacts-'));
  try {
    fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({ build:{ directories:{ output:'artifacts' } } }));
    for(const name of ['nested/TalaTrace-Setup-1.2.0.exe','nested/TalaTrace-1.2.0-win.zip','TalaTrace-1.2.01-win.zip','TalaTrace-1.2.0-rc.1-win.zip','win-unpacked/TalaTrace-1.2.0.exe','upgrade-backup/Old-1.2.0.exe','build-tools/rcedit-1.2.0.exe']) {
      const file=path.join(root,'artifacts',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');
    }
    assert.deepEqual(findArtifacts('1.2.0',root).map(a=>a.name).sort(),['TalaTrace-1.2.0-win.zip','TalaTrace-Setup-1.2.0.exe']);
    fs.mkdirSync(path.join(root,'artifacts','another'));
    fs.writeFileSync(path.join(root,'artifacts','another','TalaTrace-Setup-1.2.0.exe'),'duplicate');
    assert.throws(()=>findArtifacts('1.2.0',root),/Duplicate artifact/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('packaging and discovery agree on explicit custom output with spaces', () => {
  const output = path.join(os.tmpdir(), 'candidate files');
  assert.deepEqual(packagingArguments('win32', output), ['run','dist:win','--','--publish','never','--config.directories.output=' + path.resolve(output)]);
  assert.throws(() => packagingArguments('unsupported'), /Unsupported/);
});

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
