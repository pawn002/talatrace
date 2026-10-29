const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('deb hooks provision sandbox even when root supports namespaces and fail on profile load errors', { skip: process.platform !== 'linux' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talatrace-hooks-'));
  const bin = path.join(root, 'bin'), app = path.join(root, 'app'), log = path.join(root, 'commands');
  fs.mkdirSync(bin); fs.mkdirSync(app);
  const profile = path.join(root, 'profile'); fs.writeFileSync(profile, 'fixture');
  const helper = path.join(app, 'chrome-sandbox'); fs.writeFileSync(helper, 'fixture');
  const stub = (name, extra = '') => fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> "$TEST_LOG"\n${extra}\n`, { mode: 0o755 });
  for (const name of ['chown', 'chmod', 'update-alternatives', 'update-mime-database', 'update-desktop-database']) stub(name);
  stub('apparmor_status', 'exit "$TEST_AA_STATUS"');
  stub('apparmor_parser', '[ "$1" != "--replace" ] || exit "$TEST_LOAD_STATUS"');
  stub('ischroot', 'exit 1');
  stub('unshare', 'exit 0');
  function run(hook, action, active = '0', load = '0') {
    const script = fs.readFileSync(path.resolve('build/linux', hook), 'utf8')
      .replaceAll('/opt/${sanitizedProductName}', app)
      .replaceAll('/usr/bin/${executable}', path.join(root, 'launcher'))
      .replaceAll('${executable}', 'fixture-app')
      .replaceAll('/etc/apparmor.d/talatrace', profile)
      .replaceAll('/usr/bin/ischroot', path.join(bin, 'ischroot'));
    const file = path.join(root, hook); fs.writeFileSync(file, script); fs.writeFileSync(log, '');
    const result = spawnSync('/bin/bash', [file, action], { encoding: 'utf8', env: { ...process.env, PATH: bin + ':/usr/bin:/bin', TEST_LOG: log, TEST_AA_STATUS: active, TEST_LOAD_STATUS: load } });
    return { ...result, calls: fs.readFileSync(log, 'utf8') };
  }
  try {
    let result = run('after-install.sh', 'configure');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.calls, /chown root:root/); assert.match(result.calls, /chmod 4755/);
    assert.doesNotMatch(result.calls, /unshare/);
    assert.match(result.calls, /apparmor_parser --replace --write-cache --skip-read-cache/);
    assert.match(result.calls, /update-alternatives --install/);
    result = run('after-install.sh', 'configure', '1');
    assert.equal(result.status, 0); assert.doesNotMatch(result.calls, /apparmor_parser/);
    result = run('after-install.sh', 'configure', '0', '17');
    assert.equal(result.status, 17, 'A failed policy load must not report a successful install');
    fs.unlinkSync(helper);
    assert.notEqual(run('after-install.sh', 'configure').status, 0);
    fs.symlinkSync(profile, helper);
    assert.notEqual(run('after-install.sh', 'configure').status, 0, 'Do not chown/chmod a linked helper');
    result = run('after-remove.sh', 'upgrade');
    assert.equal(result.status, 0); assert.equal(result.calls, '', 'Old postrm must leave the new install alone');
    result = run('after-remove.sh', 'remove');
    assert.equal(result.status, 0); assert.match(result.calls, /apparmor_parser --remove/);
    assert.match(result.calls, /update-alternatives --remove fixture-app/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
