// Frozen upstream artifacts. Update hashes/revisions together, then validate locally.
module.exports = {
  whisper: { tag: 'v1.8.4', commit: '9386f239401074690479731c1e41683fbbeac557', repository: 'https://github.com/ggerganov/whisper.cpp.git' },
  vad: {
    filename: 'ggml-silero-v5.1.2.bin', sizeBytes: 885098,
    sha256: '29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf',
    url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/9ffd54a1e1ee413ddf265af9913beaf518d1639b/ggml-silero-v5.1.2.bin',
  },
  ffmpegWindows: {
    filename: 'ffmpeg-2026-10-26.zip', sizeBytes: 200485356,
    sha256: 'ab827dffa97ba92f1c2f0420ec8187088953cb21110c9461cc42bac18a7cb297',
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-26-14-25/ffmpeg-N-128100-gceb466cbcd-win64-gpl.zip',
  },
};
