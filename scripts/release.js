#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const { syncVersions } = require('./sync-version');

// ============================================================================
// Utility Functions
// ============================================================================

function execCommand(cmd, options = {}) {
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
    });
    return { success: true, stdout: stdout || '', stderr: '' };
  } catch (error) {
    if (!options.ignoreError) {
      console.error(`\n❌ Command failed: ${cmd}`);
      console.error(error.message);
      if (!options.silent) {
        process.exit(1);
      }
    }
    return {
      success: false,
      stdout: error.stdout ? error.stdout.toString() : '',
      stderr: error.stderr ? error.stderr.toString() : error.message,
    };
  }
}

function question(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function parseVersion(version) {
  const parts = version.split('.').map(Number);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

function getNextVersions(currentVersion) {
  const { major, minor, patch } = parseVersion(currentVersion);
  return {
    patch: `${major}.${minor}.${patch + 1}`,
    minor: `${major}.${minor + 1}.0`,
    major: `${major + 1}.0.0`,
  };
}

function categorizeCommit(message) {
  const lower = message.toLowerCase();
  if (
    lower.startsWith('merge pull request') ||
    lower.startsWith('merge branch') ||
    lower.startsWith('wip on') ||
    lower.startsWith('index on')
  ) return 'Other';

  if (lower.includes('feat:') || lower.includes('add')) return 'Added';
  if (lower.includes('fix:')) return 'Fixed';
  if (lower.includes('refactor:') || lower.includes('update')) return 'Changed';
  if (lower.includes('remove') || lower.includes('delete')) return 'Removed';
  return 'Other';
}

function getCommitsSince(tagOrRef) {
  const cmd = tagOrRef
    ? `git log ${tagOrRef}..HEAD --pretty=format:"%h|||%s"`
    : `git log --pretty=format:"%h|||%s"`;

  const result = execCommand(cmd, { silent: true, ignoreError: true });
  if (!result.success || !result.stdout.trim()) return [];

  return result.stdout.trim().split('\n').map((line) => {
    const [hash, message] = line.split('|||');
    return { hash, message: (message || '').trim(), category: categorizeCommit(message || '') };
  });
}

function generateChangelogEntry(version, commits) {
  const date = new Date().toISOString().split('T')[0];
  const grouped = { Added: [], Fixed: [], Changed: [], Removed: [] };

  commits.forEach((commit) => {
    if (commit.category !== 'Other' && grouped[commit.category]) {
      let msg = commit.message;
      msg = msg.replace(/^(feat|fix|refactor|docs|chore|remove|delete|add|update):\s*/i, '');
      msg = msg.charAt(0).toUpperCase() + msg.slice(1);
      grouped[commit.category].push(msg);
    }
  });

  let entry = `## [${version}] - ${date}\n`;
  for (const [category, messages] of Object.entries(grouped)) {
    if (messages.length > 0) {
      entry += `\n### ${category}\n`;
      messages.forEach((msg) => { entry += `- ${msg}\n`; });
    }
  }
  return entry;
}

function ensureChangelogExists() {
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    fs.writeFileSync(changelogPath, `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
`, 'utf8');
    console.log('📝 Created CHANGELOG.md');
  }
}

function prependChangelog(entry, version) {
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogPath, 'utf8');

  if (version && changelog.includes(`## [${version}]`)) {
    console.log(`⚠️  CHANGELOG already contains an entry for v${version} — skipping insert.`);
    return;
  }

  const unreleasedIndex = changelog.indexOf('## [Unreleased]');
  if (unreleasedIndex === -1) {
    const lines = changelog.split('\n');
    const insertIndex = lines.findIndex((line) => line.startsWith('##'));
    if (insertIndex !== -1) {
      lines.splice(insertIndex, 0, entry);
    } else {
      lines.push(entry);
    }
    fs.writeFileSync(changelogPath, lines.join('\n'), 'utf8');
  } else {
    const unreleasedEnd = changelog.indexOf('\n', unreleasedIndex);
    const nextSection = changelog.indexOf('\n## [', unreleasedEnd);
    const before = changelog.slice(0, unreleasedEnd + 1);
    const after = nextSection === -1 ? '' : changelog.slice(nextSection + 1);
    fs.writeFileSync(changelogPath, before + '\n' + entry + '\n' + after, 'utf8');
  }
}

function updatePackageVersions(version) {
  syncVersions(process.cwd(), version);
}

function checkGitStatus() {
  const result = execCommand('git status --porcelain', { silent: true });
  const changes = result.stdout.trim().split('\n').filter((line) => line.trim());
  return { clean: changes.length === 0, changes };
}

function checkGhCli() {
  return execCommand('gh --version', { silent: true, ignoreError: true }).success;
}

function findArtifacts(version) {
  const distDir = path.join(process.cwd(), 'release');
  if (!fs.existsSync(distDir)) return [];

  const exts = ['.exe', '.zip', '.dmg', '.AppImage', '.deb'];
  return fs.readdirSync(distDir)
    .filter((f) => exts.some((ext) => f.endsWith(ext)) && f.includes(version))
    .map((f) => ({ path: path.join(distDir, f), name: f }));
}

function extractVersionSection(changelog, version) {
  const versionHeader = `## [${version}]`;
  const startIndex = changelog.indexOf(versionHeader);
  if (startIndex === -1) return '';
  const nextHeaderIndex = changelog.indexOf('\n## [', startIndex + 1);
  const endIndex = nextHeaderIndex === -1 ? changelog.length : nextHeaderIndex;
  return changelog.slice(startIndex, endIndex).trim();
}

const GUI_EDITORS = new Set(['notepad', 'notepad++', 'code', 'code-insiders', 'subl', 'atom', 'gedit', 'kate', 'wordpad']);

function isGuiEditor(editor) {
  return GUI_EDITORS.has(path.basename(editor).replace(/\.exe$/i, '').toLowerCase());
}

async function openEditor(filePath) {
  const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vi');
  console.log(`\nOpening: ${filePath}`);
  console.log(`Editor:  ${editor}`);

  if (process.platform === 'win32' && !isGuiEditor(editor)) {
    console.log(`⚠️  "${editor}" may not accept keyboard input from this script on Windows.`);
    console.log('   Set EDITOR to a GUI editor (e.g. notepad, code) if needed.');
  }

  try {
    const stdinMode = isGuiEditor(editor) ? 'ignore' : 'inherit';
    execSync(`${editor} "${filePath}"`, { stdio: [stdinMode, 'inherit', 'inherit'] });
  } catch {
    console.log(`⚠️  Could not open editor. Please edit manually: ${filePath}`);
  }

  await question('Press Enter when you are finished editing...');
}

// ============================================================================
// Workflow Steps
// ============================================================================

async function step1_validateGit() {
  console.log('\n🔍 Step 1: Validating git status...');
  const branch = execCommand('git branch --show-current', { silent: true }).stdout.trim();
  if (branch !== 'main') throw new Error('Run the release wizard on main after merging the feature PR.');
  const status = checkGitStatus();
  if (!status.clean) {
    console.error('\n❌ Git working tree is not clean.');
    console.error('Uncommitted changes:');
    status.changes.forEach((change) => console.error(`  ${change}`));
    console.error('\nPlease commit or stash your changes first.');
    process.exit(1);
  }
  console.log('✅ Git working tree is clean');
}

async function step2_selectVersion() {
  console.log('\n📝 Step 2: Select version number...');

  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;
  const nextVersions = getNextVersions(currentVersion);

  console.log(`\nCurrent version: ${currentVersion}`);
  console.log('Available versions:');
  console.log(`  1) patch: ${nextVersions.patch} (bug fixes)`);
  console.log(`  2) minor: ${nextVersions.minor} (new features)`);
  console.log(`  3) major: ${nextVersions.major} (breaking changes)`);
  console.log('  4) custom');

  const choice = (await question('\nSelect version [1]: ')).trim() || '1';

  let selectedVersion;
  switch (choice) {
    case '1': selectedVersion = nextVersions.patch; break;
    case '2': selectedVersion = nextVersions.minor; break;
    case '3': selectedVersion = nextVersions.major; break;
    case '4':
      selectedVersion = (await question('Enter custom version (e.g., 1.2.3): ')).trim();
      if (!/^\d+\.\d+\.\d+$/.test(selectedVersion)) {
        console.error('\n❌ Invalid version format. Use semver (e.g., 1.2.3)');
        process.exit(1);
      }
      break;
    default:
      console.error('\n❌ Invalid choice');
      process.exit(1);
  }

  console.log(`✅ Selected version: ${selectedVersion}`);
  return selectedVersion;
}

async function step3_prepareChangelog(version) {
  console.log('\n📋 Step 3: Preparing CHANGELOG entry...');

  const lastTagResult = execCommand('git describe --tags --match "v[0-9]*" --abbrev=0', { silent: true, ignoreError: true });
  const lastTag = lastTagResult.success ? lastTagResult.stdout.trim() : null;

  const commits = getCommitsSince(lastTag);
  console.log(`Found ${commits.length} commit(s) to include`);

  if (commits.length === 0) {
    console.log('⚠️  No commits found since last release.');
    const continueAnyway = await question('Continue anyway? [y/N]: ');
    if (continueAnyway.toLowerCase() !== 'y') {
      console.log('Exiting.');
      process.exit(0);
    }
  }

  const existing = fs.readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8');
  const unreleased = extractVersionSection(existing, 'Unreleased').replace(/^## \[Unreleased\][^\n]*\n?/, '').trim();
  const entry = unreleased
    ? `## [${version}] - ${new Date().toISOString().split('T')[0]}\n\n${unreleased}\n`
    : generateChangelogEntry(version, commits);
  const tempFile = path.join(process.cwd(), '.changelog-temp.md');
  fs.writeFileSync(tempFile, entry, 'utf8');

  console.log('\nPreview of CHANGELOG entry:');
  console.log('─'.repeat(40));
  console.log(entry);
  console.log('─'.repeat(40));

  const edit = await question('\nEdit CHANGELOG entry before continuing? [y/N]: ');
  let finalEntry = entry;
  if (edit.toLowerCase() === 'y') {
    await openEditor(tempFile);
    finalEntry = fs.readFileSync(tempFile, 'utf8');
    console.log('\nUpdated CHANGELOG entry:');
    console.log('─'.repeat(40));
    console.log(finalEntry);
    console.log('─'.repeat(40));
  }

  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

  console.log('✅ CHANGELOG entry ready');
  return finalEntry;
}

async function step4_updateFiles(version) {
  console.log('\n📝 Step 4: Updating version in package files...');
  updatePackageVersions(version);
  console.log(`✅ package.json + frontend/package.json updated to ${version}`);
}

async function step5_build(version) {
  console.log('\n🔨 Step 5: Building application...');

  if (process.platform === 'win32') {
    console.log('\n⚠️  electron-builder requires administrator privileges on Windows.');
    console.log('\nPlease complete these steps:');
    console.log('  1. Open a NEW terminal as administrator');
    console.log('     (Right-click terminal app → "Run as administrator")');
    console.log('  2. Navigate to this directory:');
    console.log(`     cd "${process.cwd()}"`);
    console.log('  3. Run the build command:');
    console.log('     npm run dist:win');
    console.log('  4. Wait for the build to complete');
    console.log('  5. Return here and confirm\n');

    const confirmed = (await question('Have you completed the build? [y/N]: ')).trim().toLowerCase();
    if (confirmed !== 'y') {
      console.log('\n⏭️  Skipped build');
      console.log('⚠️  Run in admin terminal before uploading artifacts: npm run dist:win');
      return false;
    }

    const artifacts = findArtifacts(version);
    if (artifacts.length === 0) {
      console.log(`\n⚠️  No build artifacts matching version ${version} found in release/`);
      const continueAnyway = (await question('Continue anyway? [y/N]: ')).trim().toLowerCase();
      if (continueAnyway !== 'y') {
        throw new Error('Build artifacts not found. Complete the build and run the script again.');
      }
    } else {
      console.log(`✅ Build artifacts verified (${artifacts.length} file(s) found)`);
      artifacts.forEach((a) => console.log(`  - ${a.name}`));
    }

    return true;
  } else {
    const proceed = (await question('Run build? [Y/n]: ')).trim().toLowerCase();
    if (proceed === 'n') {
      console.log('⏭️  Skipped build');
      return false;
    }
    console.log('\nBuilding...');
    const result = execCommand('npm run dist', { ignoreError: true });
    if (!result.success) throw new Error('Build failed.');
    console.log('✅ Build completed');
    return true;
  }
}

async function step6_commit(version) {
  console.log('\n💾 Step 6: Creating version bump commit...');

  const proceed = (await question('Create commit? [Y/n]: ')).trim().toLowerCase();
  if (proceed === 'n') {
    console.log('⏭️  Skipped commit');
    console.log('\n⚠️  Manual steps:');
    console.log('  git add package.json frontend/package.json CHANGELOG.md');
    console.log(`  git commit -m "chore: release v${version}"`);
    return false;
  }

  const versionFiles = ['package.json', 'package-lock.json', 'frontend/package.json', 'frontend/package-lock.json', 'backend/package.json', 'backend/package-lock.json', 'CHANGELOG.md'].filter(file => fs.existsSync(file));
  execCommand('git add ' + versionFiles.join(' '));

  const commitMsg = `chore: release v${version}`;
  const tempMsgFile = path.join(process.cwd(), '.commit-msg-temp.txt');
  fs.writeFileSync(tempMsgFile, commitMsg, 'utf8');
  try {
    execCommand(`git commit -F "${tempMsgFile}"`);
  } finally {
    if (fs.existsSync(tempMsgFile)) fs.unlinkSync(tempMsgFile);
  }

  console.log('✅ Committed version bump');
  return true;
}

async function step7_tag(version) {
  console.log('\n🏷️  Step 7: Creating git tag...');

  const tagName = `v${version}`;
  const existingTag = execCommand(`git tag -l ${tagName}`, { silent: true, ignoreError: true });
  if (existingTag.stdout.trim() === tagName) {
    console.log(`\n⚠️  Tag ${tagName} already exists locally.`);
    const action = (await question('  [s]kip, [d]elete and recreate, or [a]bort? [s]: ')).trim().toLowerCase() || 's';
    if (action === 'a') throw new Error(`Tag ${tagName} already exists. Aborting.`);
    if (action === 'd') {
      execCommand(`git tag -d ${tagName}`);
    } else {
      console.log(`⏭️  Skipped (using existing tag ${tagName})`);
      return true;
    }
  }

  const proceed = (await question('Create tag? [Y/n]: ')).trim().toLowerCase();
  if (proceed === 'n') {
    console.log('⏭️  Skipped tag');
    console.log(`\n⚠️  Manual step: git tag -a ${tagName} -m "Release ${tagName}"`);
    return false;
  }

  execCommand(`git tag -a ${tagName} -m "Release ${tagName}"`);
  console.log(`✅ Created tag ${tagName}`);
  return true;
}

async function step8_push() {
  console.log('\n🚀 Step 8: Pushing to remote...');

  const proceed = (await question('Push commit and tags to remote? [Y/n]: ')).trim().toLowerCase();
  if (proceed === 'n') {
    console.log('⏭️  Skipped push');
    console.log('\n⚠️  Manual steps:');
    console.log('  git push');
    console.log('  git push --tags');
    return false;
  }

  execCommand('git push');
  execCommand('git push --tags');
  console.log('✅ Pushed to remote');
  return true;
}

async function step9_release(version) {
  console.log('\n🎉 Step 9: Creating GitHub release...');

  if (!checkGhCli()) {
    console.log('\n⚠️  GitHub CLI (gh) not found. Install from: https://cli.github.com/');
    console.log('\nManual steps:');
    console.log('1. Go to GitHub releases page');
    console.log(`2. Create new release for tag v${version}`);
    console.log('3. Upload artifacts from release/');
    return;
  }

  const createRelease = (await question('Create GitHub release? [Y/n]: ')).trim().toLowerCase();
  if (createRelease === 'n') {
    console.log('⏭️  Skipped release creation');
    return;
  }

  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const versionSection = extractVersionSection(changelog, version);

  const tempFile = path.join(process.cwd(), '.release-notes-temp.md');
  fs.writeFileSync(tempFile, versionSection || `Release v${version}`, 'utf8');

  const tagName = `v${version}`;
  try {
    execCommand(`gh release create ${tagName} --title "Release ${tagName}" --notes-file "${tempFile}"`);
    console.log(`✅ Created GitHub release: ${tagName}`);

    const uploadArtifacts = (await question('\nUpload distribution files? [Y/n]: ')).trim().toLowerCase();
    if (uploadArtifacts !== 'n') {
      const artifacts = findArtifacts(version);
      if (artifacts.length === 0) {
        console.log('\n⚠️  No build artifacts found in release/');
      } else {
        console.log(`\nFound ${artifacts.length} artifact(s):`);
        artifacts.forEach((a) => console.log(`  - ${a.name}`));
        for (const artifact of artifacts) {
          console.log(`Uploading ${artifact.name}...`);
          execCommand(`gh release upload ${tagName} "${artifact.path}"`);
        }
        console.log('✅ Artifacts uploaded');
      }
    }
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }

  const remoteResult = execCommand('git remote get-url origin', { silent: true, ignoreError: true });
  if (remoteResult.success) {
    const repoUrl = remoteResult.stdout.trim()
      .replace('git@github.com:', 'https://github.com/')
      .replace(/\.git$/, '');
    console.log(`\n🔗 View at: ${repoUrl}/releases/tag/${tagName}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🚀 TalaTrace - Interactive Release Script');
  console.log('=====================================================\n');

  // Check git is available before doing anything else
  const gitCheck = execCommand('git --version', { silent: true, ignoreError: true });
  if (!gitCheck.success) {
    console.error('❌ ERROR: Git is not available in your PATH.');
    console.error('\nThis script must run in a normal (non-admin) terminal where git is accessible.');
    console.error('\nIf you opened an admin terminal: close it and run this script from a regular terminal.');
    console.error('The build step (Step 5) will pause and ask you to open a separate admin terminal for that step only.');
    console.error('\nIf git is genuinely missing from PATH:');
    console.error('  - Right-click "This PC" → Properties → Advanced system settings');
    console.error('  - Environment Variables → System variables → Path → Edit');
    console.error('  - Add the Git cmd directory (e.g. C:\\Program Files\\Git\\cmd)\n');
    process.exit(1);
  }

  if (process.platform === 'win32') {
    console.log('ℹ️  The build step (Step 5) will pause with instructions to run in a separate admin terminal.');
    console.log('   All other steps run here in this normal terminal.\n');
  }

  // Phase 1: Collect all info (no file changes yet)
  await step1_validateGit();
  const version = await step2_selectVersion();
  const changelogEntry = await step3_prepareChangelog(version);

  // Confirm before touching any files
  console.log('\n────────────────────────────────────────');
  console.log('Ready to apply changes:');
  console.log(`  • package.json + frontend/package.json → ${version}`);
  console.log('  • Build application (Step 5)');
  console.log('  • CHANGELOG.md prepended with new entry');
  console.log('  • Commit, tag, push, create GitHub release');
  console.log('────────────────────────────────────────');
  const confirm = (await question('\nProceed? [Y/n]: ')).trim().toLowerCase();
  if (confirm === 'n') {
    console.log('Exiting. No files were modified.');
    process.exit(0);
  }

  // Phase 2: Apply changes
  const pkgPath = path.join(process.cwd(), 'package.json');
  const frontendPkgPath = path.join(process.cwd(), 'frontend', 'package.json');
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');

  const originalPkg = fs.readFileSync(pkgPath, 'utf8');
  const originalFrontendPkg = fs.existsSync(frontendPkgPath) ? fs.readFileSync(frontendPkgPath, 'utf8') : null;
  const originalChangelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : null;
  const otherVersionFiles = ['package-lock.json', 'frontend/package-lock.json', 'backend/package.json', 'backend/package-lock.json']
    .filter(file => fs.existsSync(file)).map(file => [file, fs.readFileSync(file, 'utf8')]);

  let committed = false;
  let tagged = false;

  try {
    await step4_updateFiles(version);
    await step5_build(version);

    ensureChangelogExists();
    prependChangelog(changelogEntry, version);
    console.log('✅ CHANGELOG.md updated');

    committed = await step6_commit(version);
    tagged = await step7_tag(version);
    await step8_push();
    await step9_release(version);

    console.log('\n✨ All done!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);

    if (!committed) {
      console.log('\n🔄 Rolling back file changes...');
      fs.writeFileSync(pkgPath, originalPkg, 'utf8');
      if (originalFrontendPkg !== null) fs.writeFileSync(frontendPkgPath, originalFrontendPkg, 'utf8');
      for (const [file, contents] of otherVersionFiles) fs.writeFileSync(file, contents, 'utf8');
      if (originalChangelog !== null) {
        fs.writeFileSync(changelogPath, originalChangelog, 'utf8');
      } else if (fs.existsSync(changelogPath)) {
        fs.unlinkSync(changelogPath);
      }
      console.log('✅ Working tree restored — no changes were committed.');
    } else if (!tagged) {
      console.log(`\n⚠️  Commit created but no tag yet.`);
      console.log(`   To finish:    git tag -a v${version} -m "Release v${version}" && git push && git push --tags`);
      console.log(`   To roll back: git reset --soft HEAD~1`);
    } else {
      console.log(`\n⚠️  Commit and tag exist — check push/release status manually.`);
    }

    process.exit(1);
  }
}

module.exports = { extractVersionSection, prependChangelog };
if (require.main === module) main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
