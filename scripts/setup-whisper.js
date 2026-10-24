#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const WHISPER_CPP_REPO = "https://github.com/ggerganov/whisper.cpp.git";

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https
      .get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          https
            .get(response.headers.location, (redirectResponse) => {
              const total = parseInt(
                redirectResponse.headers["content-length"] || "0",
                10,
              );
              let downloaded = 0;

              redirectResponse.on("data", (chunk) => {
                downloaded += chunk.length;
                const progress =
                  total > 0 ? ((downloaded / total) * 100).toFixed(2) : "0";
                process.stdout.write(`\rDownloading... ${progress}%`);
              });

              redirectResponse.pipe(file);
              file.on("finish", () => {
                file.close();
                console.log("\n");
                resolve();
              });
            })
            .on("error", reject);
        } else {
          const total = parseInt(response.headers["content-length"] || "0", 10);
          let downloaded = 0;

          response.on("data", (chunk) => {
            downloaded += chunk.length;
            const progress =
              total > 0 ? ((downloaded / total) * 100).toFixed(2) : "0";
            process.stdout.write(`\rDownloading... ${progress}%`);
          });

          response.pipe(file);
          file.on("finish", () => {
            file.close();
            console.log("\n");
            resolve();
          });
        }
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function setupWhisper() {
  console.log("🎙️  Setting up Whisper.cpp...\n");

  const projectRoot = path.join(__dirname, "..");
  const whisperDir = path.join(projectRoot, "whisper.cpp");
  const modelsDir = path.join(projectRoot, "models");
  const platform = process.platform;

  // Create models directory
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
    console.log("✅ Created models directory");
  }

  // Clone whisper.cpp if not exists
  if (!fs.existsSync(whisperDir)) {
    console.log("📥 Cloning whisper.cpp repository...");
    try {
      execSync(`git clone ${WHISPER_CPP_REPO} "${whisperDir}"`, {
        stdio: "inherit",
      });
      console.log("✅ Repository cloned successfully");
    } catch (error) {
      console.error(
        "❌ Failed to clone repository. Make sure git is installed.",
      );
      process.exit(1);
    }
  } else {
    console.log("✅ whisper.cpp directory already exists");
  }

  // Build whisper
  console.log("\n🔧 Building whisper.cpp...");

  try {
    if (platform === "win32") {
      // Windows build using MinGW or MSVC
      console.log("Building for Windows...");

      // Try using make (if MinGW is available)
      try {
        execSync("make --version", { stdio: "ignore" });
        execSync("make", {
          stdio: "inherit",
          cwd: whisperDir,
        });
        console.log("✅ Built successfully with make");
      } catch (error) {
        // Try CMake as fallback
        console.log("Trying CMake build...");
        try {
          execSync("cmake --version", { stdio: "ignore" });

          const buildDir = path.join(whisperDir, "build");
          if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir);
          }

          execSync("cmake ..", {
            stdio: "inherit",
            cwd: buildDir,
          });

          execSync("cmake --build . --config Release", {
            stdio: "inherit",
            cwd: buildDir,
          });

          console.log("✅ Built successfully with CMake");
        } catch (cmakeError) {
          console.error(
            "❌ Build failed. Please install either MinGW (with make) or CMake.",
          );
          console.error("   MinGW: https://www.mingw-w64.org/");
          console.error("   CMake: https://cmake.org/download/");
          process.exit(1);
        }
      }
    } else {
      // Unix-like systems (macOS, Linux)
      console.log(`Building for ${platform}...`);

      execSync("make", {
        stdio: "inherit",
        cwd: whisperDir,
      });

      // Make binary executable
      const mainBin = path.join(whisperDir, "main");
      if (fs.existsSync(mainBin)) {
        fs.chmodSync(mainBin, "755");
      }

      console.log("✅ Built successfully");
    }
  } catch (error) {
    console.error("❌ Build failed:", error.message);
    process.exit(1);
  }

  // Verify binary exists — check known build output locations
  // whisper-cli.exe (renamed from main.exe in v1.7+); Vulkan variant preferred
  const candidatePaths =
    platform === "win32"
      ? [
          path.join(whisperDir, "build-vulkan", "bin", "whisper-cli.exe"),
          path.join(whisperDir, "build-baseline", "bin", "Release", "whisper-cli.exe"),
          path.join(whisperDir, "build", "bin", "Release", "whisper-cli.exe"),
        ]
      : [
          path.join(whisperDir, "build", "bin", "whisper-cli"),
          path.join(whisperDir, "whisper-cli"),
          path.join(whisperDir, "main"),
        ];

  const foundBinary = candidatePaths.find((p) => fs.existsSync(p));

  if (!foundBinary) {
    console.error("❌ Binary not found. Checked:");
    candidatePaths.forEach((p) => console.error(`   ${p}`));
    process.exit(1);
  }

  console.log(`✅ Binary found at: ${foundBinary}`);

  // Download models
  console.log("\n📥 Downloading Whisper models...");

  const models = [
    {
      name: "silero-v5.1.2",
      size: "0.9 MB",
      url: "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin",
    },
    {
      name: "tiny",
      size: "39 MB",
      url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
    },
    {
      name: "base",
      size: "74 MB",
      url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
    },
  ];

  for (const model of models) {
    const modelPath = path.join(modelsDir, `ggml-${model.name}.bin`);

    if (fs.existsSync(modelPath)) {
      console.log(`✅ Model '${model.name}' already exists`);
    } else {
      console.log(`📥 Downloading model '${model.name}' (${model.size})...`);
      try {
        await downloadFile(model.url, modelPath);
        console.log(`✅ Model '${model.name}' downloaded successfully`);
      } catch (error) {
        console.error(
          `❌ Failed to download model '${model.name}':`,
          error.message,
        );
      }
    }
  }

  // Setup ffmpeg
  console.log("\n📥 Setting up ffmpeg for audio conversion...");
  try {
    execSync("node scripts/setup-ffmpeg.js", {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
  } catch (error) {
    console.error("❌ ffmpeg setup failed:", error.message);
    console.log("⚠️  Multi-format audio support will not be available");
  }

  console.log("\n✨ Setup complete!");

  // Report which whisper backends are available
  if (platform === "win32") {
    const vulkanBin = path.join(whisperDir, "build-vulkan", "bin", "whisper-cli.exe");
    const baselineBin = path.join(whisperDir, "build-baseline", "bin", "Release", "whisper-cli.exe");
    console.log("\n📊 Whisper backends detected:");
    console.log(`   Vulkan iGPU  : ${fs.existsSync(vulkanBin)   ? "✅ " + vulkanBin   : "❌ not built (run: npm run build:whisper-variants)"}`);
    console.log(`   Baseline CPU : ${fs.existsSync(baselineBin) ? "✅ " + baselineBin : "❌ not built (run: npm run build:whisper-baseline)"}`);
    if (fs.existsSync(vulkanBin)) {
      console.log("   → App will prefer Vulkan (1.7–4x faster on Intel Iris Xe)");
    }
  }

  console.log("\nNext steps:");
  console.log("1. Start the app: npm run dev");
}

// Run the setup
setupWhisper().catch((error) => {
  console.error("❌ Setup failed:", error);
  process.exit(1);
});
