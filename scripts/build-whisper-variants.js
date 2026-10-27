#!/usr/bin/env node

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gatherSystemInfo } = require('./system-info.js');

const { ensureWhisperSource } = require('./native-source.cjs');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    variant: null,
    clean: false,
    verbose: false
  };

  for (const arg of args) {
    if (arg.startsWith('--variant=')) {
      options.variant = arg.split('=')[1];
    } else if (arg === '--clean') {
      options.clean = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node build-whisper-variants.js [options]

Options:
  --variant=<name>    Build specific variant (baseline, avx512, sycl, vulkan, openvino)
  --clean             Clean build directories before building
  --verbose, -v       Show detailed build output
  --help, -h          Show this help message

Examples:
  node build-whisper-variants.js                    # Build all available variants
  node build-whisper-variants.js --variant=baseline # Build only baseline
  node build-whisper-variants.js --clean --verbose  # Clean build with verbose output
`);
      process.exit(0);
    }
  }

  return options;
}

// Variant configurations
function getVariantConfig(variantName) {
  const configs = {
    baseline: {
      name: 'baseline',
      description: 'CPU baseline without host-native tuning (GGML_NATIVE=OFF)',
      cmakeArgs: [
        '-DWHISPER_BUILD_EXAMPLES=ON',
        '-DCMAKE_BUILD_TYPE=Release',
        '-DGGML_NATIVE=OFF'
      ],
      requiresToolchain: null
    },
    avx512: {
      name: 'avx512',
      description: 'Intel AVX-512 SIMD optimizations',
      cmakeArgs: [
        '-DWHISPER_BUILD_EXAMPLES=ON',
        '-DCMAKE_BUILD_TYPE=Release',
        '-DGGML_AVX512=ON',
        '-DGGML_AVX512_VNNI=ON',
        '-DGGML_AVX512_VBMI=ON'
      ],
      requiresToolchain: null
    },
    sycl: {
      name: 'sycl',
      description: 'Intel GPU acceleration via SYCL',
      // Compiler paths are resolved at build time from the detected oneAPI install
      cmakeArgs: [
        '-DWHISPER_BUILD_EXAMPLES=ON',
        '-DCMAKE_BUILD_TYPE=Release',
        '-DGGML_SYCL=1',
      ],
      requiresToolchain: 'oneAPI'
    },
    vulkan: {
      name: 'vulkan',
      description: 'Vulkan GPU acceleration (iGPU/dGPU, works with existing drivers)',
      cmakeArgs: [
        '-DWHISPER_BUILD_EXAMPLES=ON',
        '-DCMAKE_BUILD_TYPE=Release',
        '-DGGML_VULKAN=1'
      ],
      requiresToolchain: 'vulkanSDK'
    },
    openvino: {
      name: 'openvino',
      description: 'Intel OpenVINO inference optimization',
      cmakeArgs: [
        '-DWHISPER_BUILD_EXAMPLES=ON',
        '-DCMAKE_BUILD_TYPE=Release',
        '-DWHISPER_OPENVINO=ON'
      ],
      requiresToolchain: 'openVINO'
    }
  };

  return configs[variantName];
}

// Ensure whisper.cpp repository exists
async function ensureWhisperCpp(projectRoot, verbose) {
  const commit = ensureWhisperSource(projectRoot);
  console.log(`Pinned whisper.cpp: ${commit}`);
  return commit;
}

// Capture environment variables from Windows batch file
function captureEnvironmentFromBatchFile(batchFilePath) {
  // Write a temp batch file that calls the target and dumps env — avoids all
  // PowerShell/escaping issues with paths containing parentheses or spaces.
  const tmpBat = path.join(os.tmpdir(), 'whisper_setup_env.bat');
  try {
    fs.writeFileSync(tmpBat, `@echo off\r\ncall "${batchFilePath}" > nul 2>&1\r\nset\r\n`);
    const output = execSync(`cmd.exe /c "${tmpBat}"`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000
    });

    const envVars = {};
    for (const line of output.split('\n')) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        envVars[match[1].trim()] = match[2].trimRight();
      }
    }
    return envVars;
  } catch (error) {
    throw new Error(`Failed to capture environment from ${batchFilePath}: ${error.message}`);
  } finally {
    try { fs.unlinkSync(tmpBat); } catch {}
  }
}

// Setup environment for specific toolchains
function setupEnvironment(variantName, systemInfo, verbose) {
  const env = { ...process.env };

  if (variantName === 'sycl' && systemInfo.toolchains.oneAPI.installed) {
    console.log('  Setting up oneAPI environment...');
    const oneAPIRoot = systemInfo.toolchains.oneAPI.path;
    const compilerBinDir = systemInfo.toolchains.oneAPI.compilerPath;

    // Manually inject the env vars cmake/SYCL needs. The setvars.bat approach fails
    // in subprocess because it calls sub-scripts with relative paths. We set the
    // minimum required vars directly instead.
    env.ONEAPI_ROOT = oneAPIRoot;
    env.CMPLR_ROOT = path.join(oneAPIRoot, 'compiler', 'latest');

    // Add icpx/icx to PATH so cmake can find them
    if (compilerBinDir && fs.existsSync(compilerBinDir)) {
      env.PATH = `${compilerBinDir};${env.PATH || process.env.PATH}`;
      console.log(`  ✅ oneAPI environment configured (icpx at ${compilerBinDir})`);
    } else {
      console.warn('  ⚠️  Could not find oneAPI compiler bin dir');
    }

    if (process.platform === 'win32') {
      // vcvarsall.bat and setvars.bat both fail when called from a Node.js subprocess
      // because they invoke sub-scripts using relative paths that break outside their
      // normal shell context. We manually reconstruct the minimum env they would set.

      // 1. Intel compiler runtime libs (libircmt.lib etc.)
      const intelLibDir = path.join(oneAPIRoot, 'compiler', 'latest', 'lib');
      if (fs.existsSync(intelLibDir)) {
        env.LIB = env.LIB ? `${intelLibDir};${env.LIB}` : intelLibDir;
      }

      // 2. MSVC headers and libs (cl.exe, kernel32.lib, etc.)
      const vsBuildToolsDir = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools';
      const msvcBase = path.join(vsBuildToolsDir, 'VC', 'Tools', 'MSVC');
      if (fs.existsSync(msvcBase)) {
        const msvcVer = fs.readdirSync(msvcBase).sort().reverse()[0];
        if (msvcVer) {
          const msvcDir = path.join(msvcBase, msvcVer);
          env.INCLUDE = [
            path.join(msvcDir, 'include'),
            env.INCLUDE
          ].filter(Boolean).join(';');
          env.LIB = [
            path.join(msvcDir, 'lib', 'x64'),
            env.LIB
          ].filter(Boolean).join(';');
          env.PATH = `${path.join(msvcDir, 'bin', 'Hostx64', 'x64')};${env.PATH}`;
          if (verbose) console.log(`     MSVC: ${msvcDir}`);
        }
      }

      // 3. Windows SDK headers and libs (kernel32.lib, windows.h, etc.)
      const wkBase = 'C:\\Program Files (x86)\\Windows Kits\\10';
      const wkLibBase = path.join(wkBase, 'Lib');
      if (fs.existsSync(wkLibBase)) {
        const sdkVer = fs.readdirSync(wkLibBase).filter(v => v.startsWith('10.')).sort((a, b) => {
          return a.split('.').map(Number).reduce((acc, n, i) => acc * 10000 + n, 0) -
                 b.split('.').map(Number).reduce((acc, n, i) => acc * 10000 + n, 0);
        }).reverse()[0];
        if (sdkVer) {
          env.INCLUDE = [
            path.join(wkBase, 'Include', sdkVer, 'ucrt'),
            path.join(wkBase, 'Include', sdkVer, 'um'),
            path.join(wkBase, 'Include', sdkVer, 'shared'),
            env.INCLUDE
          ].filter(Boolean).join(';');
          env.LIB = [
            path.join(wkLibBase, sdkVer, 'ucrt', 'x64'),
            path.join(wkLibBase, sdkVer, 'um', 'x64'),
            env.LIB
          ].filter(Boolean).join(';');
          // Also add SDK bin dir for rc.exe (Resource Compiler)
          const sdkBinDir = path.join(wkBase, 'bin', sdkVer, 'x64');
          if (fs.existsSync(sdkBinDir)) {
            env.PATH = `${sdkBinDir};${env.PATH}`;
          }
          if (verbose) console.log(`     Windows SDK: ${sdkVer}`);
        }
      }
    }

    if (verbose) {
      console.log(`     ONEAPI_ROOT: ${env.ONEAPI_ROOT}`);
      console.log(`     CMPLR_ROOT:  ${env.CMPLR_ROOT}`);
    }
  }

  if (variantName === 'vulkan' && systemInfo.toolchains.vulkanSDK && systemInfo.toolchains.vulkanSDK.installed) {
    const sdkPath = systemInfo.toolchains.vulkanSDK.path;
    env.VULKAN_SDK = sdkPath;
    // Ensure glslc is on PATH for shader compilation
    const sdkBin = path.join(sdkPath, 'Bin');
    if (fs.existsSync(sdkBin)) {
      env.PATH = `${sdkBin};${env.PATH || process.env.PATH}`;
    }
    if (verbose) console.log(`  ✅ Vulkan SDK: ${sdkPath}`);

    if (process.platform === 'win32') {
      // Vulkan's vulkan-shaders-gen ExternalProject spawns a nested cmake configure
      // which loses the MSVC environment under VS generator. We use Ninja + manual
      // MSVC env to keep INCLUDE/LIB/PATH stable across all subprocess levels.
      const vsBuildToolsDir = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools';
      const msvcBase = path.join(vsBuildToolsDir, 'VC', 'Tools', 'MSVC');
      if (fs.existsSync(msvcBase)) {
        const msvcVer = fs.readdirSync(msvcBase).sort().reverse()[0];
        if (msvcVer) {
          const msvcDir = path.join(msvcBase, msvcVer);
          env.INCLUDE = [
            path.join(msvcDir, 'include'),
            env.INCLUDE
          ].filter(Boolean).join(';');
          env.LIB = [
            path.join(msvcDir, 'lib', 'x64'),
            env.LIB
          ].filter(Boolean).join(';');
          env.PATH = `${path.join(msvcDir, 'bin', 'Hostx64', 'x64')};${env.PATH}`;
          if (verbose) console.log(`     MSVC: ${msvcDir}`);
        }
      }
      const wkBase = 'C:\\Program Files (x86)\\Windows Kits\\10';
      const wkLibBase = path.join(wkBase, 'Lib');
      if (fs.existsSync(wkLibBase)) {
        const sdkVer = fs.readdirSync(wkLibBase)
          .filter(v => v.startsWith('10.'))
          .sort().reverse()[0];
        if (sdkVer) {
          env.INCLUDE = [
            path.join(wkBase, 'Include', sdkVer, 'ucrt'),
            path.join(wkBase, 'Include', sdkVer, 'um'),
            path.join(wkBase, 'Include', sdkVer, 'shared'),
            env.INCLUDE
          ].filter(Boolean).join(';');
          env.LIB = [
            path.join(wkLibBase, sdkVer, 'ucrt', 'x64'),
            path.join(wkLibBase, sdkVer, 'um', 'x64'),
            env.LIB
          ].filter(Boolean).join(';');
          const sdkBinDir = path.join(wkBase, 'bin', sdkVer, 'x64');
          if (fs.existsSync(sdkBinDir)) {
            env.PATH = `${sdkBinDir};${env.PATH}`;
          }
          if (verbose) console.log(`     Windows SDK: ${sdkVer}`);
        }
      }
    }
  }

  if (variantName === 'openvino' && systemInfo.toolchains.openVINO.installed) {
    console.log('  Setting up OpenVINO environment...');
    const setupvars = systemInfo.toolchains.openVINO.setupvars;

    if (process.platform === 'win32') {
      console.log('  🔄 Sourcing OpenVINO environment variables...');

      try {
        const openvinoEnv = captureEnvironmentFromBatchFile(setupvars);
        Object.assign(env, openvinoEnv);

        console.log('  ✅ OpenVINO environment configured successfully');

        if (verbose) {
          console.log(`     Captured ${Object.keys(openvinoEnv).length} environment variables`);
          console.log(`     OpenVINO: ${env.INTEL_OPENVINO_DIR || 'detected'}`);
        }
      } catch (error) {
        console.error('  ❌ Failed to source OpenVINO environment');
        console.error(`     ${error.message}`);
        console.log('  ⚠️  Falling back to manual setup:');
        console.log(`      Run: "${setupvars}"`);
        console.log(`      Then: npm run build:whisper-openvino\n`);
        // Don't throw - let CMake fail with helpful error message
      }
    }
  }

  return env;
}

// Build a single variant
async function buildVariant(variantName, systemInfo, options) {
  const projectRoot = path.join(__dirname, '..');
  const whisperDir = path.join(projectRoot, 'whisper.cpp');
  const config = getVariantConfig(variantName);

  if (!config) {
    throw new Error(`Unknown variant: ${variantName}`);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Building variant: ${config.name}`);
  console.log(`Description: ${config.description}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Check if variant is buildable
  const buildableVariant = systemInfo.buildableVariants.find(v => v.name === variantName);
  if (buildableVariant && !buildableVariant.buildable) {
    console.log(`❌ Cannot build ${variantName}: ${buildableVariant.reason}\n`);
    return { success: false, variant: variantName, reason: buildableVariant.reason };
  }

  const buildDir = path.join(whisperDir, `build-${variantName}`);
  const outputDir = path.join(projectRoot, 'whisper-bins', variantName);

  // Create directories
  fs.mkdirSync(outputDir, { recursive: true });

  // Clean if requested
  if (options.clean && fs.existsSync(buildDir)) {
    if (!path.resolve(buildDir).startsWith(path.resolve(whisperDir) + path.sep)) throw new Error('Build cleanup escaped the native source directory');
    console.log('🧹 Cleaning build directory...');
    fs.rmSync(buildDir, { recursive: true, force: true });
  }

  fs.mkdirSync(buildDir, { recursive: true });

  // Setup environment
  const env = setupEnvironment(variantName, systemInfo, options.verbose);

  try {
    // Configure with CMake
    let cmakeArgs = [...config.cmakeArgs];

    // Add full compiler paths for SYCL variant.
    // Visual Studio generators ignore CMAKE_C/CXX_COMPILER overrides, so we
    // switch to the NMake Makefiles generator which respects them.
    if (variantName === 'sycl' && systemInfo.toolchains.oneAPI.installed) {
      const compilerBin = systemInfo.toolchains.oneAPI.compilerPath;
      const ext = process.platform === 'win32' ? '.exe' : '';
      const icx  = path.join(compilerBin, `icx${ext}`);
      const icpx = path.join(compilerBin, `icpx${ext}`);
      const icxCl = path.join(compilerBin, `icx-cl${ext}`);
      const cCompiler = fs.existsSync(icxCl) ? icxCl : icx;
      // dpcpp-cl was removed in oneAPI 2025.1+; use icx-cl -fsycl for SYCL builds.
      const cxxCompiler = icxCl;
      if (fs.existsSync(cxxCompiler)) {
        cmakeArgs.unshift('-G', 'Ninja');
        cmakeArgs.push(`-DCMAKE_C_COMPILER=${cCompiler}`);
        cmakeArgs.push(`-DCMAKE_CXX_COMPILER=${cxxCompiler}`);
        cmakeArgs.push(`-DCMAKE_CXX_FLAGS=-fsycl`);
      }
    }

    // Vulkan's vulkan-shaders-gen ExternalProject fails with VS generator because
    // nested cmake invocations lose MSVC PATH. Use Ninja + cl.exe instead.
    if (variantName === 'vulkan' && process.platform === 'win32') {
      const vsBuildToolsDir = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools';
      const msvcBase = path.join(vsBuildToolsDir, 'VC', 'Tools', 'MSVC');
      if (fs.existsSync(msvcBase)) {
        const msvcVer = fs.readdirSync(msvcBase).sort().reverse()[0];
        const clExe = path.join(msvcBase, msvcVer, 'bin', 'Hostx64', 'x64', 'cl.exe');
        if (fs.existsSync(clExe)) {
          cmakeArgs.unshift('-G', 'Ninja');
          cmakeArgs.push(`-DCMAKE_C_COMPILER=${clExe}`);
          cmakeArgs.push(`-DCMAKE_CXX_COMPILER=${clExe}`);
        }
      }
    }

    // Add OpenVINO cmake path if building openvino variant
    if (variantName === 'openvino' && systemInfo.toolchains.openVINO.installed) {
      const openvinoCmakePath = path.join(systemInfo.toolchains.openVINO.path, 'runtime', 'cmake');
      cmakeArgs.push(`-DCMAKE_PREFIX_PATH=${openvinoCmakePath}`);
    }

    console.log('🔧 Configuring with CMake...');
    if (options.verbose) {
      console.log(`   Args: ${cmakeArgs.join(' ')} ..`);
    }

    // Use execFileSync with an array so paths with spaces/parens aren't shell-split
    execFileSync('cmake', [...cmakeArgs, '..'], {
      cwd: buildDir,
      stdio: options.verbose ? 'inherit' : 'pipe',
      env: env
    });

    console.log('✅ Configuration complete\n');

    // Build
    console.log('🔨 Building whisper binary...');
    console.log('   This may take several minutes...');

    const startTime = Date.now();
    execFileSync('cmake', ['--build', '.', '--config', 'Release', '--parallel', '4'], {
      cwd: buildDir,
      stdio: options.verbose ? 'inherit' : 'pipe',
      env: env
    });

    const buildTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Build complete (${buildTime}s)\n`);

    // Find and copy binary
    console.log('📦 Copying binary to output directory...');

    const possibleBinaryPaths = [
      path.join(buildDir, 'bin', 'Release', 'whisper-cli.exe'),  // Windows CMake
      path.join(buildDir, 'bin', 'Release', 'main.exe'),         // Windows CMake (old)
      path.join(buildDir, 'bin', 'whisper-cli.exe'),             // Windows
      path.join(buildDir, 'bin', 'main.exe'),                    // Windows
      path.join(buildDir, 'whisper-cli'),                        // Unix
      path.join(buildDir, 'main'),                               // Unix
      path.join(buildDir, 'bin', 'whisper-cli'),                 // Unix (bin dir)
      path.join(buildDir, 'bin', 'main')                         // Unix (bin dir)
    ];

    let binaryFound = false;
    for (const binaryPath of possibleBinaryPaths) {
      if (fs.existsSync(binaryPath)) {
        const binaryName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
        const destPath = path.join(outputDir, binaryName);
        fs.copyFileSync(binaryPath, destPath);

        // Make executable on Unix
        if (process.platform !== 'win32') {
          fs.chmodSync(destPath, '755');
        }

        console.log(`✅ Binary copied to: ${destPath}\n`);
        binaryFound = true;
        break;
      }
    }

    if (!binaryFound) {
      throw new Error('Binary not found in expected locations');
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ ${variantName} variant built successfully!`);
    console.log('═══════════════════════════════════════════════════════════\n');

    return {
      success: true,
      variant: variantName,
      buildTime: buildTime,
      outputPath: outputDir
    };

  } catch (error) {
    console.error(`\n❌ Build failed for ${variantName}:`);
    console.error(`   ${error.message}\n`);

    return {
      success: false,
      variant: variantName,
      error: error.message
    };
  }
}

// Main function
async function main() {
  const options = parseArgs();

  console.log('🎙️  Whisper.cpp Multi-Variant Builder\n');

  // Gather system information
  console.log('🔍 Detecting system capabilities...\n');
  const systemInfo = await gatherSystemInfo();

  const buildableVariants = systemInfo.buildableVariants
    .filter(v => v.buildable)
    .map(v => v.name);

  console.log(`Found ${buildableVariants.length} buildable variant(s): ${buildableVariants.join(', ')}\n`);

  if (buildableVariants.length === 0) {
    console.error('❌ No variants can be built on this system.');
    console.error('   Run "node scripts/system-info.js" for details.\n');
    process.exit(1);
  }

  // Ensure whisper.cpp exists
  const projectRoot = path.join(__dirname, '..');
  const commitHash = await ensureWhisperCpp(projectRoot, options.verbose);

  // Determine which variants to build
  let variantsToBuild = buildableVariants;
  if (options.variant) {
    if (!buildableVariants.includes(options.variant)) {
      console.error(`❌ Variant "${options.variant}" is not buildable on this system.`);
      console.error(`   Buildable variants: ${buildableVariants.join(', ')}\n`);
      process.exit(1);
    }
    variantsToBuild = [options.variant];
  }

  console.log(`Building ${variantsToBuild.length} variant(s): ${variantsToBuild.join(', ')}\n`);

  // Build each variant
  const results = [];
  for (const variant of variantsToBuild) {
    const result = await buildVariant(variant, systemInfo, options);
    results.push(result);
  }

  // Generate build report
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                      BUILD SUMMARY                        ');
  console.log('═══════════════════════════════════════════════════════════\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (successful.length > 0) {
    console.log('✅ Successful builds:');
    for (const result of successful) {
      console.log(`   ${result.variant.padEnd(12)} - ${result.buildTime}s`);
    }
    console.log('');
  }

  if (failed.length > 0) {
    console.log('❌ Failed builds:');
    for (const result of failed) {
      console.log(`   ${result.variant.padEnd(12)} - ${result.reason || result.error}`);
    }
    console.log('');
  }

  // Save build report
  const buildReport = {
    timestamp: new Date().toISOString(),
    whisperCommit: commitHash,
    systemInfo: {
      platform: systemInfo.platform,
      cpu: systemInfo.cpu.model,
      cores: systemInfo.cpu.cores
    },
    results: results
  };

  const reportPath = path.join(projectRoot, 'whisper-bins', 'build-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(buildReport, null, 2));
  console.log(`📄 Build report saved to: ${reportPath}\n`);

  // Exit with appropriate code
  if (failed.length > 0 && successful.length === 0) {
    console.error('❌ All builds failed\n');
    process.exit(1);
  } else if (failed.length > 0) {
    console.warn('⚠️  Some builds failed\n');
    process.exit(0); // Partial success
  } else {
    console.log('✅ All builds successful!\n');
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { buildVariant, getVariantConfig };
