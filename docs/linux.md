# Linux delivery work

Tracked in [#24](https://github.com/pawn002/talatrace/issues/24). Released 1.2.0 downloads remain Windows-only. Linux changes are candidates under validation, not a published support claim.

## Initial target and build

Start with Ubuntu 24.04 LTS x86_64 and CPU recognition for both engines. Other distributions, ARM64 and Linux GPU acceleration need separate validation. Native libraries linked against the build host's glibc/libstdc++ set a compatibility floor; an Ubuntu 24.04 build does not establish compatibility with older distributions. `GGML_NATIVE=OFF` avoids host-specific tuning but is not a complete CPU instruction-set compatibility test.

Install Node/npm as described in [Development](development.md), then install native build and Electron desktop dependencies:

```bash
sudo apt-get update
sudo apt-get install -y build-essential cmake ninja-build pkg-config ca-certificates xz-utils libgtk-3-0t64 libnss3 libasound2t64 libgbm1 libxss1 libxtst6 libnotify4 libsecret-1-0 libfuse2t64
npm run setup
npm run start
```

Setup builds pinned CPU Whisper and Parakeet, verifies the pinned FFmpeg archive and Silero weights, and obtains verified Tiny/Base setup weights. Recognition models in a fresh packaged profile still require explicit downloads. Linux packages include the native engines, FFmpeg and their notices; they do not require a compiler, Node.js or Python on the end user's system. Desktop libraries and AppImage FUSE support remain host prerequisites.

```bash
npm test
npm run build
npm run test:speech-activity
node scripts/prepare-smoke-models.cjs
npx electron-builder --linux --x64 --publish never
node tests/electron/packaged-release-smoke.cjs release/linux-unpacked/whisper-electron-app
npm run test:interview-smoke
sha256sum release/*.AppImage release/*.deb > release/SHA256SUMS.txt
```

The smoke commands use isolated temporary profiles and known public audio. Install `xvfb xauth` and prefix desktop commands with `xvfb-run -a` on a headless test host. Fake microphone tests exercise MediaRecorder and processing, not physical microphone permissions or PipeWire/PulseAudio integration. No sandbox-disabling launch flags are part of the app configuration. Ubuntu's AppArmor/user-namespace policy and Chromium sandbox installation must be checked on a real desktop; see [Ubuntu's release notes](https://documentation.ubuntu.com/release-notes/24.04/).

`.github/workflows/linux.yml` builds candidates and runs unit/native, packaged offline-recognition and fake-microphone workflow checks. On AppArmor hosts it grants user namespaces to the two explicit CI executable paths, rather than disabling the system restriction or Chromium sandbox. That runner-only policy is not installer validation. Its artifacts are CI candidates, not public releases. Keep #24 open until the desktop and installer matrix below passes.

The deb now ships `/etc/apparmor.d/talatrace` as a dpkg conffile, granting user namespaces to `/opt/TalaTrace/whisper-electron-app`. It preserves administrator edits on upgrade and loads the profile during installation when AppArmor is active. The bundled Chromium helper is provisioned as root-owned mode 4755; root's own namespace access no longer decides its permissions. This follows [Ubuntu's executable-specific namespace guidance](https://documentation.ubuntu.com/release-notes/24.04/), keeps Chromium sandboxing enabled and does not disable the system-wide restriction. It is not a full AppArmor confinement policy. CI separately installs the deb and tests the `/opt` executable using the shipped profile; its test-directory exception does not cover that executable.

If replacing an earlier testing deb that also identifies as 1.2.0, use `sudo apt install --reinstall ./TalaTrace-1.2.0-linux-amd64.deb`. Ordinary installation may otherwise retain the already installed same-version candidate. [Issue #28](https://github.com/pawn002/talatrace/issues/28) records the original launch failure on Ubuntu 26.04.1; that report does not establish support for 26.04, and the corrected package needs desktop retesting.

## Required release evidence

- Record the exact distro, architecture, kernel, CPU, X11/Wayland session and audio stack.
- Install AppImage/deb on a clean desktop; check launch, desktop integration, executable permissions, sandbox, microphone permission and physical recording.
- Verify both engines offline, timing/pause context, Copy/clipboard, all export formats, model integrity/download/deletion and persisted model/theme preferences.
- Test an upgrade, uninstall and retained user data separately. Check legacy profile retention and writable model storage. A clean-profile executable launch is not installation/upgrade evidence.
- Record package hashes and runtime dependency checks. Recheck Windows packaging and runtime behavior before merging shared changes.

Local WSL/Xvfb results and CI status should be recorded with the implementation PR. WSL cannot establish that a clean Ubuntu desktop, Wayland microphone access or installer lifecycle works.

## Initial local evidence — 27 October 2026

Ubuntu 24.04.5 x86_64 on WSL2, kernel 6.6.87.2, Node 24.21.0; headless Xvfb and CPU engines:

- Native setup, 130 frontend tests and 50 Electron tests passed. Speech detection preserved a long noisy gap and a brief speech interruption.
- Both the unpacked app and the AppImage (extract-and-run mode) passed offline Base/Parakeet reference recognition, legacy-profile retention, model preference restart and clean-profile launch. The AppImage FUSE mount path was not tested.
- Real MediaRecorder capture with fake reference audio passed stop/transcribe, timing/pause metadata, Copy, file import and a second recording. No sandbox-disabling flags were used.
- Native runtime executable permissions and linked libraries were checked; none were missing on this host.
- Windows: 50 Electron tests and a rebuilt unpacked package passed both engines, preference restart, profile retention and clean launch.

AppImage/deb artifacts are development candidates at version 1.2.0; no Linux release was published. Desktop audio, Wayland, sandbox policy on a stock Ubuntu kernel and clean-desktop installer lifecycle remain outstanding.

## Candidate 2 desktop review follow-up

The [review on #24](https://github.com/pawn002/talatrace/issues/24#issuecomment-6459673572) reports successful deb launch under its AppArmor profile with the namespace restriction enabled, physical microphone recording on both engines, copy to another app, exports, model download/deletion and preference retention on Ubuntu 26.04.1/XFCE/X11/PipeWire at 150% scale. This is evidence for that configuration, not a blanket Ubuntu 26.04 support claim. Tiny's presence was subsequently explained by the user's separate manual download.

The review found export suffix/folder problems, addressed in development with explicit format selection and session folder/name reuse. A reported partial-width spectrum was not reproduced with a full-band fixture at DPR 1.5 on either platform. The AppImage mounts through FUSE on that desktop but fails under the namespace policy; prefer the deb on that Ubuntu configuration pending a separate AppImage solution. Actual network-disconnected operation, Wayland and the desktop installer lifecycle remain unverified by this review; socket monitoring alone does not establish offline behavior.

## Candidate 3 export retest follow-up

The [candidate 3 retest](https://github.com/pawn002/talatrace/issues/24#issuecomment-6482171034) confirmed format defaults, missing/wrong suffix correction, valid output, successful-folder/name reuse and keyboard format selection after reinstalling over candidate 2. It also resolved the spectrum report: the right-hand frequency bands were quiet, not clipped. The deb sandbox setup and launch still passed.

The remaining export feedback exposed a duplicate GTK overwrite prompt and a native replacement message box missing from AT-SPI. Development now suppresses the preliminary Linux check and uses a Candor alert modal for the final destination, preserving files on cancellation. The save dialog explicitly requests the title/button label “Save transcript”; some Linux desktops may ignore a supplied title. Narrow headers/export controls, a minimum window size, bounded in-flow persistent notifications, save concurrency and focus after the native picker closes were also addressed. Chromium accessibility-tree and fixture tests do not establish AT-SPI behavior; retest the replacement dialog and native picker on the reported desktop. The intermittent first-click problem was observed only under automation and remains subject to that desktop retest.
