import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ElectronService {
  private electron: any;

  constructor() {
    this.electron = (window as any).electronAPI;
  }

  async selectAudioFile(): Promise<string | null> {
    return await this.electron.selectAudioFile();
  }

  async transcribeAudio(audioPath: string, options: any): Promise<any> {
    return await this.electron.transcribeAudio(audioPath, options);
  }

  async transcribeRecording(bytes: Uint8Array, options: any): Promise<any> {
    return await this.electron.transcribeRecording(bytes, options);
  }

  async saveTranscript(resultData: any): Promise<string | null> {
    return await this.electron.saveTranscript(resultData);
  }

  async getAvailableModels(): Promise<any[]> {
    return await this.electron.getAvailableModels();
  }

  async downloadModel(modelName: string): Promise<any> {
    return await this.electron.downloadModel(modelName);
  }

  async getSystemInfo(): Promise<any> {
    return await this.electron.getSystemInfo();
  }

  async getTranscriptionHistory(): Promise<any[]> {
    return await this.electron.getTranscriptionHistory();
  }

  onTranscriptionProgress(
    callback: (data: { progress: number; message?: string }) => void
  ): void {
    this.electron.onTranscriptionProgress(callback);
  }

  onTranscriptionCompleted(callback: (result: any) => void): void {
    this.electron.onTranscriptionCompleted(callback);
  }

  onTranscriptionError(callback: (error: string) => void): void {
    this.electron.onTranscriptionError(callback);
  }

  onModelDownloadProgress(callback: (data: any) => void): void {
    this.electron.onModelDownloadProgress(callback);
  }

  onMenuAction(action: string, callback: () => void): void {
    this.electron.onMenuAction(action, callback);
  }

  removeAllListeners(channel: string): void {
    this.electron.removeAllListeners(channel);
  }
}
