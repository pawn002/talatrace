import * as path from 'path';
import { existsSync } from 'fs';

/** Keep development and packaged layouts explicit; never search PATH for engines. */
export function nativePaths(base: string, packaged: boolean, platform = process.platform, exists = existsSync) {
  const windows = platform === 'win32';
  const cpu = path.join(base, 'whisper.cpp', packaged ? 'build' : 'build-baseline', 'bin', ...(windows ? ['Release'] : []));
  const vulkan = path.join(base, 'whisper.cpp', 'build-vulkan', 'bin');
  const useVulkan = windows && exists(path.join(vulkan, 'whisper-cli.exe'));
  const whisperBinDir = useVulkan ? vulkan : cpu;
  return {
    whisperBinDir,
    whisperPath: path.join(whisperBinDir, windows ? 'whisper-cli.exe' : 'whisper-cli'),
    ffmpegPath: path.join(base, 'ffmpeg', 'bin', windows ? 'ffmpeg.exe' : 'ffmpeg'),
    backend: useVulkan ? 'Vulkan' : 'CPU',
  };
}
