# Linux delivery work

Tracked in [#24](https://github.com/pawn002/talatrace/issues/24). Windows 1.3.0 is the stable release; Linux packages are a separate experimental prerelease, not full platform support.

## Experimental support status

On 29 October 2026 the maintainer accepted candidate 5 as the experimental Linux baseline and ended the current personal desktop-testing cycle. The remaining validation is follow-up work, not a request for more testing from the maintainer or a prerequisite for an explicitly labelled experimental prerelease. Full Linux support remains tracked in #24. The [1.3.0 Linux experimental prerelease](https://github.com/pawn002/talatrace/releases/tag/v1.3.0-linux-preview.1) builds on that baseline; see [release notes](releases/1.3.0.md) for changes and package checks. Its internal application version is 1.3.0.

Recommended experimental scope: **x86_64 CPU recognition, deb package**. Ubuntu 24.04 is the build/CI baseline. Candidate 5 was tested on Ubuntu 26.04.1, XFCE/X11, PipeWire, at 150% display scale. Other distributions, Wayland, ARM64 and GPU acceleration are unvalidated.

Verified evidence:

- Candidate 5 desktop testing passed launch/sandbox setup, human-speech recording and file import with Whisper Tiny and Parakeet, Copy, all four export formats, replacement/cancellation, model/preferences retention, keyboard zoom and narrow layouts.
- Notification timeout choices, hover/focus/inactivity pauses, explicit error dismissal and restart retention passed desktop testing. The overwrite explanation is exposed through AT-SPI.
- [CI for the packaged revision](https://github.com/pawn002/talatrace/actions/runs/40793838206) passed 193 tests, installed/unpacked package checks, both engines with HTTP(S) blocked during recognition, recording fixtures and package checksums. Automated offline checks do not establish an actually disconnected desktop run.
- [The complete desktop report](https://github.com/pawn002/talatrace/issues/24#issuecomment-6495189236) records the exact package hash and environment. Its apparent empty Parakeet result from the earlier synthesized speaker-to-mic setup was resolved by ordinary human-speech testing.

Known limitations and follow-up work:

- The notification stack can clip a message at its lower edge. Toasts float over content while visible. Their timeout can be changed or set to Never. Identical active warnings/errors are coalesced in 1.3.0.
- Theme tooltips can remain visible after AT-SPI activation until the pointer moves. Very narrow/high-zoom layouts retain a known overflow fixture; the tested maximized 200% desktop layout remained keyboard reachable.
- Pause-marker differences between separate recordings are inconclusive because background voices/audio preprocessing differed. They do not establish a model-specific defect; timing and pauses remain approximate context.
- AppImage FUSE mounting passed, but launch under Ubuntu's namespace policy remains unresolved. **Use the deb; do not disable Chromium's sandbox or system-wide restrictions as a workaround.**
- Real disconnected desktop use, Wayland, the clean install/upgrade/remove/data-retention matrix and Orca announcements remain untested. Reinstalling over earlier same-version candidates and retaining that profile passed; this is not the complete lifecycle matrix.

An experimental prerelease must prominently link this status, identify the exact tested source/checksums, recommend the deb and avoid implying Linux/Windows support parity or accessibility certification. The existing stable-release acceptance criteria remain open until their evidence is available.

The candidate 5 subtitle rounding and misleading empty-TXT hint are corrected in 1.3.0. JSON diagnostics remain available without recognized speech; TXT requires text or timeline context and subtitles require speech text.

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

## Candidate 4 desktop retest follow-up

The [candidate 4 retest](https://github.com/pawn002/talatrace/issues/24#issuecomment-6483705926) confirmed the accessible in-app confirmation, safe cancellation/replacement, immediate retry, title, format/folder reuse and narrow layout. It also demonstrated that the GTK portal still performs native overwrite confirmation despite the earlier attempt to suppress it. The in-flow notification band was rejected. This supersedes the earlier claims that native overwrite suppression was verified; mocked picker tests did not exercise the portal.

The next candidate treats an explicitly typed TXT/SRT/VTT/JSON extension as the format choice, so the native picker and writer agree on the destination. Missing suffixes still use the selected format and require an app confirmation if the appended destination exists. The app no longer repeats the native prompt for an unchanged path. The Candor alert now has a linked accessible description. Cleared format values recover visibly; empty subtitle exports are blocked without losing JSON diagnostics or meaningful TXT timing context.

Floating toasts return with a saved configurable timeout, Never and pause behavior; the maintainer explicitly approved this change to AGENTS.md. Real keyboard shortcuts now implement zoom instead of relying on removed menu accelerators. The initial window fits the display work area; its minimum is 360×320 DIP, and packaged tests record native bounds and renderer devicePixelRatio at 150% scale on Linux. These measurements should be compared with the desktop report's apparent 720px minimum rather than equating pixels, DIP and AT-SPI coordinates.

Both engines pass controlled reference-file recognition in the rebuilt Windows package. This does not establish why Parakeet returned no text for synthesized speaker-to-microphone audio on the desktop; the physical recording step still needs retesting. Genuine disconnected desktop use, Wayland, AppImage launch policy and the full installer lifecycle remain outstanding.
