import { AudioRecorderService } from './audio-recorder.service';

class FakeRecorder {
  static isTypeSupported = () => true;
  static current: FakeRecorder;
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { FakeRecorder.current = this; }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    // Final audio must be included, even when emitted only after stop().
    Promise.resolve().then(() => {
      this.ondataavailable?.({ data: new Blob(['final audio']) });
      this.onstop?.();
    });
  }
}

describe('AudioRecorderService', () => {
  let service: AudioRecorderService;
  let track: { stop: jest.Mock; onended: (() => void) | null };
  let getUserMedia: jest.Mock;
  const originalRecorder = globalThis.MediaRecorder;
  const originalDevices = navigator.mediaDevices;

  beforeEach(() => {
    service = new AudioRecorderService();
    track = { stop: jest.fn(), onended: null };
    getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [track], getAudioTracks: () => [track] });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    globalThis.MediaRecorder = FakeRecorder as any;
  });
  afterEach(() => {
    service.discard();
    globalThis.MediaRecorder = originalRecorder;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalDevices });
  });

  it('releases the microphone immediately on stop and includes the final audio chunk', async () => {
    await service.start(jest.fn(), jest.fn());
    const result = service.stop();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect((await result).size).toBe(11);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  });

  it('releases a stream whose permission request completes after discard', async () => {
    let grant!: (stream: any) => void;
    getUserMedia.mockReturnValue(new Promise(resolve => { grant = resolve; }));
    const start = service.start(jest.fn(), jest.fn());
    service.discard();
    grant({ getTracks: () => [track] });
    await expect(start).rejects.toThrow('cancelled');
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('explains denied permission', async () => {
    getUserMedia.mockRejectedValue({ name: 'NotAllowedError' });
    await expect(service.start(jest.fn(), jest.fn())).rejects.toThrow('Microphone access was denied');
  });

  it('discards audio without returning a result and releases all tracks', async () => {
    await service.start(jest.fn(), jest.fn());
    service.discard();
    await expect(service.stop()).rejects.toThrow('No recording is active');
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects a pending stop if discarded instead of leaving it unresolved', async () => {
    await service.start(jest.fn(), jest.fn());
    const stop = service.stop();
    service.discard();
    await expect(stop).rejects.toThrow('cancelled');
  });
});
