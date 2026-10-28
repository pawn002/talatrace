import { contextBridge, ipcRenderer } from "electron";

// Whitelist of allowed IPC channels for security
const ALLOWED_RECEIVE_CHANNELS = [
  "transcription-progress",
  "transcription-completed",
  "transcription-error",
  "model-download-progress",
  "menu-open-file",
] as const;

// Allowed menu actions
const ALLOWED_MENU_ACTIONS = ["open-file"] as const;

type AllowedChannel = (typeof ALLOWED_RECEIVE_CHANNELS)[number];
type AllowedMenuAction = (typeof ALLOWED_MENU_ACTIONS)[number];

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  selectAudioFile: () => ipcRenderer.invoke("select-audio-file"),

  transcribeAudio: (audioPath: string, options: any) =>
    ipcRenderer.invoke("transcribe-audio", audioPath, options),

  transcribeRecording: (bytes: Uint8Array, options: any) =>
    ipcRenderer.invoke("transcribe-recording", bytes, options),

  saveTranscript: (resultData: any, format: 'txt' | 'srt' | 'vtt' | 'json' = 'txt') =>
    ipcRenderer.invoke("save-transcript", resultData, format),

  getAvailableModels: () => ipcRenderer.invoke("get-available-models"),

  downloadModel: (modelName: string) =>
    ipcRenderer.invoke("download-model", modelName),

  deleteModel: (modelName: string) => ipcRenderer.invoke("delete-model", modelName),

  getSystemInfo: () => ipcRenderer.invoke("get-system-info"),

  getTranscriptionHistory: () =>
    ipcRenderer.invoke("get-transcription-history"),

  // Event listeners
  onTranscriptionProgress: (
    callback: (data: { progress: number; message?: string }) => void,
  ) => {
    ipcRenderer.on("transcription-progress", (event, data) => callback(data));
  },

  onTranscriptionCompleted: (callback: (result: any) => void) => {
    ipcRenderer.on("transcription-completed", (event, result) =>
      callback(result),
    );
  },

  onTranscriptionError: (callback: (error: string) => void) => {
    ipcRenderer.on("transcription-error", (event, error) => callback(error));
  },

  onModelDownloadProgress: (callback: (data: any) => void) => {
    ipcRenderer.on("model-download-progress", (event, data) => callback(data));
  },

  onMenuAction: (action: string, callback: () => void) => {
    // Validate action against whitelist
    if (ALLOWED_MENU_ACTIONS.includes(action as AllowedMenuAction)) {
      ipcRenderer.on(`menu-${action}`, () => callback());
    } else {
      console.warn(`[Preload] Blocked unrecognized menu action: ${action}`);
    }
  },

  // Remove listeners - only for whitelisted channels
  removeAllListeners: (channel: string) => {
    if (ALLOWED_RECEIVE_CHANNELS.includes(channel as AllowedChannel)) {
      ipcRenderer.removeAllListeners(channel);
    } else {
      console.warn(`[Preload] Blocked removeAllListeners for channel: ${channel}`);
    }
  },
});

// Type definitions for TypeScript
declare global {
  interface Window {
    electronAPI: {
      selectAudioFile: () => Promise<{ path: string; size: number } | null>;
      transcribeAudio: (audioPath: string, options: any) => Promise<any>;
      transcribeRecording: (bytes: Uint8Array, options: any) => Promise<any>;
      saveTranscript: (resultData: any, format?: 'txt' | 'srt' | 'vtt' | 'json') => Promise<string | null>;
      getAvailableModels: () => Promise<any[]>;
      downloadModel: (modelName: string) => Promise<any>;
      deleteModel: (modelName: string) => Promise<any>;
      getSystemInfo: () => Promise<any>;
      getTranscriptionHistory: () => Promise<any[]>;
      onTranscriptionProgress: (
        callback: (data: { progress: number; message?: string }) => void,
      ) => void;
      onTranscriptionCompleted: (callback: (result: any) => void) => void;
      onTranscriptionError: (callback: (error: string) => void) => void;
      onModelDownloadProgress: (callback: (data: any) => void) => void;
      onMenuAction: (action: string, callback: () => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}
