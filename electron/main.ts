import { app, BrowserWindow, ipcMain, Menu, dialog, screen } from 'electron';
import * as path from 'path';
import isDev from 'electron-is-dev';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { TranscriptionService } from './services/transcription.service';
import { storeRecording, removeStaleRecordings } from './services/recording-storage';
import { pathToFileURL } from 'url';
import { TranscriptExporter } from './services/transcript-export';
import { randomUUID } from 'crypto';

// Import package.json for app version
const packageJson = require(path.join(__dirname, '../../package.json'));

// Keep pre-rename profiles (including packaged builds) and their models/preferences.
const legacyPackagedProfile = path.join(app.getPath('appData'), 'Whisper Transcription');
app.setPath('userData', app.isPackaged && existsSync(legacyPackagedProfile)
  ? legacyPackagedProfile
  : path.join(app.getPath('appData'), packageJson.name));
app.setName('TalaTrace');

let mainWindow: BrowserWindow | null = null;
let transcriptionService: TranscriptionService | null = null;

function createWindow() {
  Menu.setApplicationMenu(null);
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1200, workArea.width),
    height: Math.min(800, workArea.height),
    minWidth: Math.min(360, workArea.width),
    minHeight: Math.min(320, workArea.height),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    title: 'TalaTrace',
    backgroundColor: '#303030',
  });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
    const delta = ['+', '='].includes(input.key) || input.code === 'NumpadAdd' ? 1
      : ['-', '_'].includes(input.key) || input.code === 'NumpadSubtract' ? -1 : 0;
    if (!delta && input.key !== '0' && input.code !== 'Numpad0') return;
    event.preventDefault();
    const contents = mainWindow?.webContents;
    if (contents) contents.setZoomLevel(delta ? Math.max(-3, Math.min(6, contents.getZoomLevel() + delta)) : 0);
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

const transcriptExporter = new TranscriptExporter({
  directory: () => app.getPath('documents'),
  choose: async options => {
    try { return await (mainWindow ? dialog.showSaveDialog(mainWindow, options) : dialog.showSaveDialog(options)); }
    finally { mainWindow?.focus(); mainWindow?.webContents.focus(); }
  },
  confirmOverwrite: async filePath => {
    if (process.platform === 'linux') return confirmTranscriptOverwrite(filePath);
    const options = { type: 'warning' as const, buttons: ['Cancel', 'Replace'], defaultId: 0, cancelId: 0,
      message: 'Replace existing transcript?', detail: filePath };
    const result = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
    return result.response === 1;
  },
});
// The renderer can answer only the current request from its own window. The
// destination/content remain in the main process, never accepted from a reply.
function confirmTranscriptOverwrite(filePath: string): Promise<boolean> {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return Promise.resolve(false);
  const contents = window.webContents;
  const requestId = randomUUID();
  return new Promise(resolve => {
    const finish = (replace: boolean) => {
      ipcMain.removeListener('transcript-overwrite-response', reply);
      contents.removeListener('destroyed', cancel);
      contents.removeListener('render-process-gone', cancel);
      contents.removeListener('did-start-navigation', cancel);
      resolve(replace);
    };
    const cancel = () => finish(false);
    const reply = (event: Electron.IpcMainEvent, id: unknown, replace: unknown) => {
      if (event.sender === contents && id === requestId) finish(replace === true);
    };
    ipcMain.on('transcript-overwrite-response', reply);
    contents.once('destroyed', cancel);
    contents.once('render-process-gone', cancel);
    contents.once('did-start-navigation', cancel);
    contents.send('transcript-overwrite-request', { requestId, filePath });
  });
}
let exportPending = false;
ipcMain.handle('save-transcript', async (_event, resultData: any, format: unknown = 'txt') => {
  if (exportPending) return null;
  exportPending = true;
  try { return await transcriptExporter.save(resultData, format); }
  finally { exportPending = false; }
});

ipcMain.handle('get-available-models', async () => {
  try {
    if (!transcriptionService) {
      throw new Error('Transcription service not initialized');
    }
    return await transcriptionService.getAvailableModels();
  } catch (error: any) {
    console.error('[Main] Error fetching models:', error);
    throw error;
  }
});

ipcMain.handle('delete-model', async (_event, modelName: string) => {
  if (!transcriptionService) throw new Error('Transcription service not initialized');
  await transcriptionService.deleteModel(modelName);
  return { success: true };
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
