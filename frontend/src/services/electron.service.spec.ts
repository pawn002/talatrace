import { NgZone } from '@angular/core';
import { ElectronService } from './electron.service';

describe('model catalogue change notifications', () => {
  it('keeps overwrite responses tied to their request and enters Angular for the dialog', () => {
    let requested!: (id: string, path: string) => void;
    const respond = jest.fn();
    (window as any).electronAPI = { onTranscriptOverwrite: (callback: typeof requested) => requested = callback, respondTranscriptOverwrite: respond };
    const run = jest.fn(callback => callback());
    const service = new ElectronService({ run } as unknown as NgZone);
    service.overwriteRequested.subscribe(request => { expect(request.filePath).toBe('/local/answer.json'); request.respond(true); });
    requested('request-1', '/local/answer.json');
    expect(run).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith('request-1', true);
  });
  afterEach(() => { delete (window as any).electronAPI; });
  it('refreshes model consumers on transcription start and native completion/error', async () => {
    let complete!: () => void, fail!: () => void;
    (window as any).electronAPI = {
      onTranscriptionCompleted: (callback: () => void) => complete = callback,
      onTranscriptionError: (callback: () => void) => fail = callback,
      transcribeAudio: async () => ({ success: true }),
      transcribeRecording: async () => ({ success: true }),
    };
    const run = jest.fn(callback => callback());
    const service = new ElectronService({ run } as unknown as NgZone);
    const changes = jest.fn(); service.modelsChanged.subscribe(changes);
    await service.transcribeAudio('/local.wav', { model: 'base' });
    await service.transcribeRecording(new Uint8Array(), { model: 'base' });
    expect(changes).toHaveBeenCalledTimes(2);
    complete(); fail();
    expect(run).toHaveBeenCalledTimes(2);
    expect(changes).toHaveBeenCalledTimes(4);
  });
  it('refreshes only after a successful download or deletion', async () => {
    (window as any).electronAPI = {
      downloadModel: jest.fn().mockResolvedValue({ success: true }),
      deleteModel: jest.fn().mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({ success: true }),
    };
    const service = new ElectronService({ run: (callback: any) => callback() } as NgZone);
    const changes = jest.fn(); service.modelsChanged.subscribe(changes);
    await service.deleteModel('base');
    expect(changes).not.toHaveBeenCalled();
    await service.downloadModel('base'); await service.deleteModel('base');
    expect(changes).toHaveBeenCalledTimes(2);
  });
});
