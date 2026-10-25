import { AudioSpectrumComponent } from './audio-spectrum.component';

describe('AudioSpectrumComponent', () => {
  let component: AudioSpectrumComponent;
  let source: { connect: jest.Mock; disconnect: jest.Mock };
  let analyser: any;
  let close: jest.Mock;
  let muted: any;
  let receivedStream: any;
  let receivedOptions: any;
  let nextFrame: FrameRequestCallback | undefined;
  let painter: any;
  let preference: any;
  const stream = { getTracks: jest.fn() };
  const originalAudioContext = globalThis.AudioContext;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    source = { connect: jest.fn(), disconnect: jest.fn() };
    analyser = { frequencyBinCount: 1024, connect: jest.fn(), disconnect: jest.fn(), getByteFrequencyData: jest.fn((data: Uint8Array) => { data[20] = 200; }) };
    muted = { gain: { value: 1 }, connect: jest.fn(), disconnect: jest.fn() };
    close = jest.fn().mockResolvedValue(undefined);
    painter = { drawImage: jest.fn(), clearRect: jest.fn(), fillRect: jest.fn() };
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(painter);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { nextFrame = callback; return 42; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    jest.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    preference = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
    window.matchMedia = jest.fn().mockReturnValue(preference);
    globalThis.AudioContext = class {
      constructor(options: any) { receivedOptions = options; }
      sampleRate = 48000;
      createMediaStreamSource(input: any) { receivedStream = input; return source; }
      createAnalyser() { return analyser; }
      createGain() { return muted; }
      resume() { return Promise.resolve(); }
      close = close;
    } as any;
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, { clientWidth: { value: 240 }, clientHeight: { value: 44 } });
    component = new AudioSpectrumComponent({ streamForAnalysis: stream } as any, { runOutsideAngular: (fn: any) => fn(), run: (fn: any) => fn() } as any);
    component.canvas = { nativeElement: canvas };
    component.ngAfterViewInit();
  });

  afterEach(() => {
    component.ngOnDestroy(); jest.restoreAllMocks();
    globalThis.AudioContext = originalAudioContext; window.matchMedia = originalMatchMedia;
  });

  async function start() {
    component.active = true; component.ngOnChanges(); await Promise.resolve();
  }

  it('analyzes the captured stream without speaker playback and releases only its analysis graph', async () => {
    await start();
    expect(receivedStream).toBe(stream);
    expect(receivedOptions.sinkId).toEqual({ type: 'none' });
    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(muted.gain.value).toBe(0);
    expect(analyser.connect).toHaveBeenCalledWith(muted);
    expect(component.available).toBe(true);
    nextFrame!(1000);
    expect(analyser.getByteFrequencyData).toHaveBeenCalled();
    expect(painter.fillRect).toHaveBeenCalled();
    component.active = false; component.ngOnChanges();
    expect(source.disconnect).toHaveBeenCalled();
    expect(analyser.disconnect).toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(component.available).toBe(false);
    expect(stream.getTracks).not.toHaveBeenCalled();
  });

  it('clears old-colour history on a theme change without restarting analysis', async () => {
    await start(); nextFrame!(1000);
    painter.clearRect.mockClear();
    const canvas = component.canvas.nativeElement;
    jest.spyOn(globalThis, 'getComputedStyle').mockReturnValue({ color: 'rgb(40, 50, 60)' } as CSSStyleDeclaration);
    nextFrame!(1100);
    expect(painter.clearRect).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
    expect(source.disconnect).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(component.available).toBe(true);
  });

  it('uses a non-scrolling display for reduced motion and follows preference changes', async () => {
    await start();
    preference.matches = true;
    preference.addEventListener.mock.calls[0][1]();
    expect(component.reducedMotion).toBe(true);
    nextFrame!(1000);
    expect(painter.drawImage).not.toHaveBeenCalled();
    expect(painter.fillRect).toHaveBeenCalled();
  });

  it('contains analysis failure and closes the graph while recording remains owned by the recorder', async () => {
    analyser.getByteFrequencyData.mockImplementation(() => { throw new Error('Analyzer failed'); });
    await start(); nextFrame!(1000);
    expect(component.unavailable).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(stream.getTracks).not.toHaveBeenCalled();
  });

  it('does not start a stale animation after stop races with context resume', async () => {
    component.active = true; component.ngOnChanges();
    component.active = false; component.ngOnChanges();
    await Promise.resolve();
    expect(component.available).toBe(false);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
