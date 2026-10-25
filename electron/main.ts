import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import * as path from 'path';
import isDev from 'electron-is-dev';
import * as fs from 'fs/promises';
import { TranscriptionService } from './services/transcription.service';
import { storeRecording, removeStaleRecordings } from './services/recording-storage';
import { pathToFileURL } from 'url';

// Import package.json for app version
const packageJson = require(path.join(__dirname, '../../package.json'));

let mainWindow: BrowserWindow | null = null;
let transcriptionService: TranscriptionService | null = null;

// Helper function to format seconds to SRT timestamp (HH:MM:SS,mmm)
function formatTimestampForSRT(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const milliseconds = Math.floor((secs % 1) * 1000);

  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const ss = Math.floor(secs).toString().padStart(2, '0');
  const mmm = milliseconds.toString().padStart(3, '0');

  return `${hh}:${mm}:${ss},${mmm}`;
}

// Helper function to format seconds to VTT timestamp (HH:MM:SS.mmm)
function formatTimestampForVTT(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const milliseconds = Math.floor((secs % 1) * 1000);

  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const ss = Math.floor(secs).toString().padStart(2, '0');
  const mmm = milliseconds.toString().padStart(3, '0');

  return `${hh}:${mm}:${ss}.${mmm}`;
}

// Helper function to convert segments array to SRT format
function convertSegmentsToSRT(segments: any[]): string {
  return segments.map((segment, index) => {
    const startTime = formatTimestampForSRT(segment.start);
    const endTime = formatTimestampForSRT(segment.end);
    const text = segment.text.trim();

    return `${index + 1}\n${startTime} --> ${endTime}\n${text}\n`;
  }).join('\n');
}

// Helper function to convert segments array to VTT format
function convertSegmentsToVTT(segments: any[]): string {
  let vttContent = 'WEBVTT\n\n';

  vttContent += segments.map(segment => {
    const startTime = formatTimestampForVTT(segment.start);
    const endTime = formatTimestampForVTT(segment.end);
    const text = segment.text.trim();

    return `${startTime} --> ${endTime}\n${text}\n`;
  }).join('\n');

  return vttContent;
}

// Helper function to convert Whisper timestamp format to SRT (for backward compatibility)
function convertToSRT(text: string): string {
  const lines = text.split('\n').filter((line) => line.trim());
  let srtContent = '';
  let index = 1;

  for (const line of lines) {
    const match = line.match(
      /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.+)/
    );
    if (match) {
      const [, start, end, subtitle] = match;
      // Convert milliseconds format from . to ,
      const srtStart = start.replace('.', ',');
      const srtEnd = end.replace('.', ',');
      srtContent += `${index}\n${srtStart} --> ${srtEnd}\n${subtitle.trim()}\n\n`;
      index++;
    }
  }

  return srtContent || text; // Fallback to original if no matches
}

// Helper function to convert Whisper timestamp format to VTT
function convertToVTT(text: string): string {
  const lines = text.split('\n').filter((line) => line.trim());
  let vttContent = 'WEBVTT\n\n';

  for (const line of lines) {
    const match = line.match(
      /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.+)/
    );
    if (match) {
      const [, start, end, subtitle] = match;
      vttContent += `${start} --> ${end}\n${subtitle.trim()}\n\n`;
    }
  }

  return vttContent === 'WEBVTT\n\n' ? text : vttContent; // Fallback to original if no matches
}

function createWindow() {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    title: 'Whisper Transcription',
    backgroundColor: '#303030',
  });

  // Grant only app-origin microphone capture and the existing Copy action.
  const appUrl = isDev ? 'http://localhost:4200' : pathToFileURL(path.join(__dirname, '../../frontend/dist/index.html')).href;
  const isAppUrl = (url: string) => isDev
    ? (() => { try { return new URL(url).origin === appUrl; } catch { return false; } })()
    : url.split(/[?#]/)[0] === appUrl;
  const appSession = mainWindow.webContents.session;
  appSession.setPermissionCheckHandler((contents, permission, origin, details) => {
    if (contents !== mainWindow?.webContents || !isAppUrl(details.requestingUrl || origin)) return false;
    return permission === 'clipboard-sanitized-write' || (permission === 'media' && details.mediaType === 'audio');
  });
  appSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const trusted = contents === mainWindow?.webContents && isAppUrl(details.requestingUrl);
    callback(trusted && (permission === 'clipboard-sanitized-write' ||
      (permission === 'media' && 'mediaTypes' in details && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio')));
  });

  // Initialize services immediately
  transcriptionService = new TranscriptionService(mainWindow);

  console.log('[Main] Services initialized');

  // Load the app immediately (no delay!)
  console.log('[Main] isDev:', isDev);
  console.log('[Main] __dirname:', __dirname);

  if (isDev) {
    mainWindow.loadURL('http://localhost:4200');
  } else {
    const indexPath = path.join(__dirname, '../../frontend/dist/index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    transcriptionService = null;
  });
}

// App lifecycle - Simplified, no backend to start!
app.whenReady().then(() => {
  void removeStaleRecordings(path.join(app.getPath('temp'), 'whisper-interview-recordings')).catch(console.error);
  createWindow();  // Create window immediately!
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('select-audio-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: 'Audio Files',
        extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'webm'],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const fsSync = require('fs');
    const stats = fsSync.statSync(filePath);
    return {
      path: filePath,
      size: stats.size,
    };
  }
  return null;
});

ipcMain.handle(
  'transcribe-audio',
  async (event, audioPath: string, options: any) => {
    try {
      if (!transcriptionService) {
        return { success: false, error: 'Service not initialized' };
      }

      // Validate file size (500MB max)
      const fsSync = require('fs');
      const stats = fsSync.statSync(audioPath);
      const maxSize = 500 * 1024 * 1024; // 500MB

      if (stats.size > maxSize) {
        return {
          success: false,
          error: 'File size exceeds 500MB limit',
        };
      }

      const job = await transcriptionService.processAudio(audioPath, {
        model: options.model || 'base',
        language: options.language,
        outputFormat: options.outputFormat || 'txt',
        timestamps: options.timestamps !== false,
        threads: options.threads || 4,
        processors: options.processors || 1,
        translate: options.translate || false,
      });

      return {
        success: true,
        data: {
          id: job.id,
          status: job.status,
          progress: job.progress,
        },
      };
    } catch (error: any) {
      console.error('[Main] Transcription error:', error);
      return {
        success: false,
        error: error.message || 'Failed to start transcription',
      };
    }
  }
);

ipcMain.handle('transcribe-recording', async (event, bytes: unknown, options: any) => {
  let recording: Awaited<ReturnType<typeof storeRecording>> | undefined;
  try {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error('Recording request must come from the app window.');
    }
    if (!transcriptionService) throw new Error('Service not initialized');
    recording = await storeRecording(bytes, path.join(app.getPath('temp'), 'whisper-interview-recordings'));
    const job = await transcriptionService.processAudio(recording.audioPath, {
      model: options?.model || 'base', language: options?.language,
      timestamps: true, threads: 4, outputFormat: 'json',
      detectQuietIntervals: true,
      alignTimestamps: true,
    }, recording.cleanup);
    return { success: true, data: { id: job.id, status: job.status } };
  } catch (error: any) {
    await recording?.cleanup().catch(() => {});
    return { success: false, error: error.message || 'Failed to transcribe recording' };
  }
});

ipcMain.handle('save-transcript', async (event, resultData: any) => {
  const saveResult = await dialog.showSaveDialog({
    defaultPath: `transcript.txt`,
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'SRT Subtitles', extensions: ['srt'] },
      { name: 'VTT Subtitles', extensions: ['vtt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!saveResult.canceled && saveResult.filePath) {
    const selectedPath = saveResult.filePath;
    const ext = path.extname(selectedPath).toLowerCase();

    let content: string;

    // Extract segments if available
    const segments = resultData?.segments;
    const hasSegments = segments && Array.isArray(segments) && segments.length > 0;

    // Format content based on selected extension
    if (ext === '.json') {
      // Full structured JSON
      content = JSON.stringify(resultData, null, 2);

    } else if (ext === '.txt') {
      // Plain text without timestamps
      if (typeof resultData?.timestampedText === 'string') {
        content = resultData.timestampedText;
      } else if (hasSegments) {
        content = segments.map((seg: any) => seg.text).join(' ');
      } else {
        content = resultData?.text || JSON.stringify(resultData);
      }

    } else if (ext === '.srt') {
      // SRT subtitle format
      if (hasSegments) {
        content = convertSegmentsToSRT(segments);
      } else {
        // Fallback: try to parse timestamped text
        const text = resultData?.text || '';
        content = convertToSRT(text);
      }

    } else if (ext === '.vtt') {
      // WebVTT subtitle format
      if (hasSegments) {
        content = convertSegmentsToVTT(segments);
      } else {
        // Fallback: try to parse timestamped text
        const text = resultData?.text || '';
        content = convertToVTT(text);
      }

    } else {
      // Default: plain text
      content = resultData?.text || JSON.stringify(resultData);
    }

    const fsSync = require('fs');
    fsSync.writeFileSync(selectedPath, content, 'utf-8');
    return selectedPath;
  }
  return null;
});

ipcMain.handle('get-available-models', async () => {
  try {
    if (!transcriptionService) {
      console.error('[Main] Transcription service not initialized');
      return [];
    }
    return await transcriptionService.getAvailableModels();
  } catch (error: any) {
    console.error('[Main] Error fetching models:', error);
    return [];
  }
});

ipcMain.handle('download-model', async (event, modelName: string) => {
  try {
    if (!transcriptionService) {
      return {
        success: false,
        message: 'Service not initialized',
      };
    }

    await transcriptionService.downloadModel(modelName, (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('model-download-progress', {
          modelName,
          progress,
        });
      }
    });

    return {
      success: true,
      message: `Model ${modelName} downloaded successfully`,
    };
  } catch (error: any) {
    console.error('[Main] Error downloading model:', error);
    return {
      success: false,
      message: error.message || 'Failed to download model',
    };
  }
});

ipcMain.handle('get-system-info', async () => {
  const os = require('os');
  return {
    platform: os.platform(),
    arch: os.arch(),
    version: packageJson.version,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    cpus: os.cpus().length,
  };
});

ipcMain.handle('get-transcription-history', async () => {
  try {
    if (!transcriptionService) {
      console.error('[Main] TranscriptionService not initialized');
      return [];
    }
    return transcriptionService.getTranscriptionHistory();
  } catch (error: any) {
    console.error('[Main] Error fetching history:', error);
    return [];
  }
});
