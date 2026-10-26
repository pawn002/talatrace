import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ElectronService {
  readonly modelsChanged = new Subject<void>();
  private electron: any;

  constructor(private zone: NgZone) {
    this.electron = (window as any).electronAPI;
    this.electron?.onTranscriptionCompleted?.(() => this.zone.run(() => this.modelsChanged.next()));
    this.electron?.onTranscriptionError?.(() => this.zone.run(() => this.modelsChanged.next()));
  }

  async selectAudioFile(): Promise<string | null> {
    return await this.electron.selectAudioFile();
  }

  async transcribeAudio(audioPath: string, options: any): Promise<any> {
    const result = await this.electron.transcribeAudio(audioPath, options);
    if (result.success) this.modelsChanged.next();
    return result;
  }

  async transcribeRecording(bytes: Uint8Array, options: any): Promise<any> {
    const result = await this.electron.transcribeRecording(bytes, options);
    if (result.success) this.modelsChanged.next();
    return result;
  }

  async saveTranscript(resultData: any): Promise<string | null> {
    return await this.electron.saveTranscript(resultData);
  }

  async getAvailableModels(): Promise<any[]> {
    return await this.electron.getAvailableModels();
  }

  async downloadModel(modelName: string): Promise<any> {
    const result = await this.electron.downloadModel(modelName);
    if (result.success) this.modelsChanged.next();
    return result;
  }

  async deleteModel(modelName: string): Promise<any> {
    const result = await this.electron.deleteModel(modelName);
    if (result.success) this.modelsChanged.next();
    return result;
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
