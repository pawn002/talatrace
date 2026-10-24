import { Injectable } from '@angular/core';

export const MAX_RECORDING_BYTES = 64 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 30 * 60;

/** Browser capture only: no network, silence removal, or audio resampling. */
@Injectable({ providedIn: 'root' })
export class AudioRecorderService {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private generation = 0;
  private rejectStop?: (error: Error) => void;

  async start(onLimit: () => void, onError: (message: string) => void): Promise<void> {
    this.discard();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('Microphone recording is unavailable in this environment.');
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (error: any) {
      const messages: Record<string, string> = {
        NotAllowedError: 'Microphone access was denied. Allow this app in your system microphone settings and try again.',
        NotFoundError: 'No microphone was found. Connect a microphone and try again.',
        NotReadableError: 'The microphone could not be opened. Check whether another app is using it.',
      };
      throw new Error(messages[error?.name] || 'Could not start microphone recording.');
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error('Recording cancelled.');
    }
    this.stream = stream;
    try {
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('This app cannot record WebM audio on this device.');
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      this.recorder = recorder;
      this.chunks = [];
      let bytes = 0;
      recorder.ondataavailable = event => {
        if (event.data.size) {
          bytes += event.data.size;
          if (bytes > MAX_RECORDING_BYTES) {
            this.discard();
            onError('Recording exceeded 64 MB and was discarded. Please record a shorter answer.');
            return;
          }
          this.chunks.push(event.data);
        }
      };
      recorder.onerror = () => {
        this.discard();
        onError('The microphone recording failed. Please try again.');
      };
      stream.getAudioTracks().forEach(track => {
        track.onended = () => {
          if (this.recorder === recorder) onLimit();
        };
      });
      recorder.start(1000);
    } catch (error) {
      this.discard();
      throw error;
    }
  }

  private chunks: Blob[] = [];

  stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) return Promise.reject(new Error('No recording is active.'));
    return new Promise((resolve, reject) => {
      this.rejectStop = reject;
      recorder.onstop = () => {
        this.rejectStop = undefined;
        const blob = new Blob(this.chunks, { type: recorder.mimeType });
        this.chunks = [];
        this.recorder = null;
        this.releaseMicrophone();
        if (!blob.size) reject(new Error('No audio was captured. Please try again.'));
        else if (blob.size > MAX_RECORDING_BYTES) reject(new Error('Recording exceeds 64 MB.'));
        else resolve(blob);
      };
      recorder.onerror = () => {
        this.discard();
        reject(new Error('Could not finish the recording. Please try again.'));
      };
      if (recorder.state !== 'inactive') recorder.stop(); // final dataavailable arrives before onstop
      this.releaseMicrophone();
    });
  }

  discard(): void {
    this.generation++;
    this.rejectStop?.(new Error('Recording cancelled.'));
    this.rejectStop = undefined;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    this.chunks = [];
    this.releaseMicrophone();
  }

  private releaseMicrophone(): void {
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.stream = null;
  }
}
