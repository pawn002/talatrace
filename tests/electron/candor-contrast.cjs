// Audit the actual rendered pairings exported by workflow-preview using klar 3.x.
// Usage: node tests/electron/candor-contrast.cjs <metrics.json> <klar.js>
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const [metricsPath, klarPath] = process.argv.slice(2);
if (!metricsPath || !klarPath) throw new Error('Provide workflow metrics.json and the installed klar CLI JavaScript entry point.');
const version = execFileSync(process.execPath, [klarPath, '--version'], { encoding: 'utf8' }).trim();
if (!/^3\./.test(version)) throw new Error(`Expected klar 3.x; found ${version}`);
const pairs = new Map();
for (const state of JSON.parse(fs.readFileSync(metricsPath, 'utf8'))) {
  for (const pairing of state.colourPairs) {
    // 14px sole-channel UI: 6.5 regular / 4.5 bold. Reading copy is 16px.
    // We conservatively use the functional floor for supplementary metadata too.
    const minimum = pairing.nonText ? 3 : pairing.size >= 16 || pairing.weight >= 700 ? 4.5 : 6.5;
    const key = JSON.stringify([pairing.foreground, pairing.background, minimum]);
    if (!pairs.has(key)) pairs.set(key, { ...pairing, minimum, states: [] });
    pairs.get(key).states.push(state.name);
  }
}
const report = [...pairs.values()].map(pairing => ({ ...pairing,
  okca: Number(execFileSync(process.execPath, [klarPath, 'contrast', pairing.foreground, pairing.background, '-q'], { encoding: 'utf8' }).trim()),
}));
if (!report.length) throw new Error('No rendered colour pairings found.');
const failures = report.filter(pairing => !Number.isFinite(pairing.okca) || pairing.okca < pairing.minimum);
fs.writeFileSync(path.join(path.dirname(metricsPath), 'candor-contrast.json'), JSON.stringify({ version, report, failures }, null, 2));
console.log(`klar ${version}: ${report.length} rendered pairings; ${failures.length} below their Candor floor.`);
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
