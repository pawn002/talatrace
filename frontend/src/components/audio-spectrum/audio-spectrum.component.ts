import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { AudioRecorderService } from '../../services/audio-recorder.service';

@Component({
  selector: 'app-audio-spectrum', standalone: true,
  template: `
    <div class="spectrum-display" [attr.data-mode]="active && available ? (reducedMotion ? 'bars-reduced-motion' : 'frequency-bars') : 'idle'">
      <canvas #spectrum aria-hidden="true"></canvas>
      @if (active && available) { <span class="spectrum-live-label">Audio spectrum</span> }
      @if (!active) {
        <div class="spectrum-placeholder">
          <span class="spectrum-bars" aria-hidden="true">@for (height of placeholderBars; track $index) { <span [style.height.%]="height"></span> }</span>
          <span class="spectrum-placeholder-label">Audio spectrum</span>
        </div>
      }
      @if (active && unavailable) { <span class="spectrum-fallback">Audio display unavailable</span> }
    </div>
  `,
  styleUrls: ['./audio-spectrum.component.scss'],
})
export class AudioSpectrumComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() active = false;
  readonly placeholderBars = [20, 35, 60, 85, 50, 30, 65, 95, 70, 40, 55, 80, 45, 25];
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
  private levels = new Float32Array(this.placeholderBars.length);
  private onPreference = () => {
    this.reducedMotion = !!this.preference?.matches;
    if (this.analyser) this.analyser.smoothingTimeConstant = this.reducedMotion ? 0 : 0.35;
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
      analyser.smoothingTimeConstant = this.reducedMotion ? 0 : 0.35;
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
              this.draw(data, context.sampleRate, analyser.fftSize, this.lastFrame ? now - this.lastFrame : 50);
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

  private draw(data: Uint8Array, sampleRate: number, fftSize: number, elapsed: number): void {
    const canvas = this.canvas.nativeElement;
    const painter = canvas.getContext('2d');
    if (!painter) throw new Error('Canvas unavailable');
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    painter.clearRect(0, 0, width, height);
    painter.fillStyle = getComputedStyle(canvas).color;
    const count = this.levels.length;
    const barWidth = 3 * scale;
    const gap = 2 * scale;
    const offset = (width - (count * barWidth + (count - 1) * gap)) / 2;
    const maxFrequency = Math.min(8000, sampleRate / 2);
    for (let index = 0; index < count; index++) {
      // Logarithmic frequency bands: bass on the left, treble on the right.
      const low = 80 * (maxFrequency / 80) ** (index / count);
      const high = 80 * (maxFrequency / 80) ** ((index + 1) / count);
      const first = Math.max(1, Math.floor(low * fftSize / sampleRate));
      const last = Math.min(data.length - 1, Math.max(first, Math.ceil(high * fftSize / sampleRate)));
      let energy = 0;
      for (let bin = first; bin <= last; bin++) energy = Math.max(energy, data[bin] / 255);
      const target = Math.max(0, (energy - 0.08) / 0.92);
      const previous = this.levels[index];
      const response = 1 - Math.exp(-elapsed / (target > previous ? 50 : 120));
      // Reduced motion uses discrete readings at 4 Hz, without easing or scrolling.
      this.levels[index] = this.reducedMotion ? target : previous + (target - previous) * response;
      if (this.levels[index] < 0.01) { this.levels[index] = 0; continue; }
      const barHeight = Math.round(height * this.levels[index]);
      if (barHeight === 0) continue;
      painter.fillRect(offset + index * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight);
    }
  }

  private clearCanvas(): void {
    const canvas = this.canvas?.nativeElement;
    try { if (canvas && this.context) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); } catch { /* Display failure never interrupts recording. */ }
  }

  private fail(): void { this.release(); this.unavailable = true; }

  private release(): void {
    this.generation++;
    this.levels.fill(0);
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
