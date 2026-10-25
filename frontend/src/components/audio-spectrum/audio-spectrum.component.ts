import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { AudioRecorderService } from '../../services/audio-recorder.service';

@Component({
  selector: 'app-audio-spectrum', standalone: true,
  template: `
    <strong class="spectrum-label" [class.spectrum-label--active]="active">{{ active ? 'Recording' : 'Microphone off' }}</strong>
    <div class="spectrum-display" [attr.data-mode]="active && available ? (reducedMotion ? 'levels' : 'spectrogram') : 'idle'">
      <canvas #spectrum aria-hidden="true"></canvas>
      @if (active && unavailable) { <span class="spectrum-fallback">Audio display unavailable</span> }
    </div>
  `,
  styleUrls: ['./audio-spectrum.component.scss'],
})
export class AudioSpectrumComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() active = false;
  @ViewChild('spectrum', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  available = false;
  unavailable = false;
  reducedMotion = false;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private mutedOutput?: GainNode;
  private animation?: number;
  private ready = false;
  private generation = 0;
  private preference?: MediaQueryList;
  private lastFrame = 0;
  private onPreference = () => {
    this.reducedMotion = !!this.preference?.matches;
    this.clearCanvas();
  };

  constructor(private recorder: AudioRecorderService, private zone: NgZone) {}

  ngAfterViewInit(): void {
    this.ready = true;
    this.preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = !!this.preference?.matches;
    this.preference?.addEventListener('change', this.onPreference);
    if (this.active) queueMicrotask(() => { if (this.ready && this.active) void this.start(); });
  }

  ngOnChanges(): void {
    if (!this.ready) return;
    if (this.active) void this.start(); else this.release();
  }

  private async start(): Promise<void> {
    this.release();
    const generation = this.generation;
    try {
      const stream = this.recorder.streamForAnalysis;
      if (!stream) throw new Error('No captured stream');
      // Electron's Chromium supports a silent sink: its clock advances without a speaker device.
      const options: AudioContextOptions & { sinkId: { type: 'none' } } = { sinkId: { type: 'none' } };
      const context = new AudioContext(options);
      this.context = context;
      const source = context.createMediaStreamSource(stream);
      this.source = source;
      const analyser = context.createAnalyser();
      this.analyser = analyser;
      analyser.fftSize = 2048;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -15;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      // Keep Chromium's graph pulling samples, with the output muted before connection.
      const muted = context.createGain();
      muted.gain.value = 0;
      this.mutedOutput = muted;
      analyser.connect(muted);
      muted.connect(context.destination);
      await context.resume();
      if (generation !== this.generation) return;
      this.available = true;
      const data = new Uint8Array(analyser.frequencyBinCount);
      this.lastFrame = 0;
      this.zone.runOutsideAngular(() => {
        const frame = (now: number) => {
          if (generation !== this.generation) return;
          if (!document.hidden && now - this.lastFrame >= (this.reducedMotion ? 250 : 50)) {
            try {
              analyser.getByteFrequencyData(data);
              this.draw(data, context.sampleRate, analyser.fftSize);
              this.lastFrame = now;
            } catch { this.zone.run(() => this.fail()); return; }
          }
          this.animation = requestAnimationFrame(frame);
        };
        this.animation = requestAnimationFrame(frame);
      });
    } catch {
      if (generation === this.generation) this.fail();
    }
  }

  private draw(data: Uint8Array, sampleRate: number, fftSize: number): void {
    const canvas = this.canvas.nativeElement;
    const painter = canvas.getContext('2d');
    if (!painter) throw new Error('Canvas unavailable');
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const step = Math.max(1, Math.round(width / 120)); // Approximately six seconds at 20 fps.
    if (this.reducedMotion) painter.clearRect(0, 0, width, height);
    else {
      painter.globalCompositeOperation = 'copy';
      painter.drawImage(canvas, -step, 0);
      painter.globalCompositeOperation = 'source-over';
      painter.clearRect(width - step, 0, step, height);
    }
    painter.fillStyle = getComputedStyle(canvas).color;
    const rows = 40;
    const maxFrequency = Math.min(8000, sampleRate / 2);
    for (let row = 0; row < rows; row++) {
      const low = 80 * (maxFrequency / 80) ** ((rows - row - 1) / rows);
      const high = 80 * (maxFrequency / 80) ** ((rows - row) / rows);
      const first = Math.max(1, Math.floor(low * fftSize / sampleRate));
      const last = Math.min(data.length - 1, Math.max(first, Math.ceil(high * fftSize / sampleRate)));
      let energy = 0;
      for (let bin = first; bin <= last; bin++) energy = Math.max(energy, data[bin] / 255);
      if (energy < 0.08) continue;
      painter.globalAlpha = 0.2 + 0.8 * energy ** 1.5;
      const y = Math.floor(row * height / rows);
      painter.fillRect(this.reducedMotion ? 0 : width - step, y, this.reducedMotion ? width * energy : step, Math.ceil(height / rows));
    }
    painter.globalAlpha = 1;
  }

  private clearCanvas(): void {
    const canvas = this.canvas?.nativeElement;
    try { if (canvas && this.context) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); } catch { /* Display failure never interrupts recording. */ }
  }

  private fail(): void { this.release(); this.unavailable = true; }

  private release(): void {
    this.generation++;
    if (this.animation !== undefined) cancelAnimationFrame(this.animation);
    this.animation = undefined;
    try { this.source?.disconnect(); } catch { /* Already disconnected. */ }
    this.source = undefined;
    this.analyser?.disconnect();
    this.analyser = undefined;
    this.mutedOutput?.disconnect();
    this.mutedOutput = undefined;
    this.clearCanvas();
    void this.context?.close().catch(() => {});
    this.context = undefined;
    this.available = false;
    this.unavailable = false;
  }

  ngOnDestroy(): void {
    this.release(); this.ready = false;
    this.preference?.removeEventListener('change', this.onPreference);
  }
}
