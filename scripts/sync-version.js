#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function syncVersions(root, version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version) {
  const updates = [];
  for (const directory of ['', 'frontend', 'backend']) {
    const manifest = path.join(root, directory, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    pkg.version = version;
    updates.push([manifest, JSON.stringify(pkg, null, 2) + '\n']);
    const lockfile = path.join(root, directory, 'package-lock.json');
    if (!fs.existsSync(lockfile)) continue;
    const lock = JSON.parse(fs.readFileSync(lockfile, 'utf8'));
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    updates.push([lockfile, JSON.stringify(lock, null, 2) + '\n']);
  }
  // Parse every manifest/lockfile before changing any version on disk.
  for (const [file, contents] of updates) fs.writeFileSync(file, contents);
  return updates.map(([file]) => path.relative(root, file));
}

module.exports = { syncVersions };
if (require.main === module) {
  console.log('Synchronized version metadata:', syncVersions(path.join(__dirname, '..')).join(', '));
}
