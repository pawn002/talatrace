import { Component, OnInit, OnDestroy, NgZone, EventEmitter, Output, ViewChild, ElementRef } from '@angular/core';
import { ElectronService } from '../../services/electron.service';
import { ToastService } from '../../services/toast.service';
import { AudioRecorderService, MAX_RECORDING_SECONDS } from '../../services/audio-recorder.service';
import { buildTranscriptTimeline, groupQuietIntervals, TimelineEntry } from '../../utils/transcript-timeline';
import { readModelPreference, saveModelPreference } from '../../model-preference';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-transcription',
  templateUrl: './transcription.component.html',
  styleUrls: ['./transcription.component.scss', './transcript-output.scss'],
  standalone: false,
})
export class TranscriptionComponent implements OnInit, OnDestroy {
  @Output() manageModels = new EventEmitter<void>();
  @ViewChild('recordTab') recordTab?: ElementRef<HTMLButtonElement>;
  @ViewChild('fileTab') fileTab?: ElementRef<HTMLButtonElement>;
  inputMode: 'record' | 'file' = 'record';
  private workflowSnapshots: Partial<Record<'record' | 'file', {
    selectedFilePath: string | null; selectedFileSize: number | null;
    transcriptionResult: any; recordedAudio: Blob | null;
    recordedDurationMs: number | null; elapsedSeconds: number;
    recordingError: string; copyError: string; copied: boolean; includeTimestamps: boolean;
  }>> = {};
  selectedFilePath: string | null = null;
  selectedFileSize: number | null = null;
  isTranscribing = false;
  isSelectingFile = false;
  transcriptionProgress = 0;
  progressMessage = '';
  transcriptionResult: any = null;
  selectedModel = readModelPreference();
  private modelChanges?: Subscription;
  selectedLanguage = 'auto';
  isRecording = false;
  isStartingRecording = false;
  isStoppingRecording = false;
  copied = false;
  copyError = '';
  elapsedSeconds = 0;
  recordedDurationMs: number | null = null;
  private recordingStartedAt?: number;
  recordingError = '';
  includeTimestamps = true;
  settingsOpen = false;
  exportFormat: 'txt' | 'srt' | 'vtt' | 'json' = 'txt';
  isSaving = false;

  onExportFormatChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (['txt', 'srt', 'vtt', 'json'].includes(select.value)) return;
    select.value = 'txt'; this.exportFormat = 'txt';
    this.toastService.show('Choose a file format, then save again. TXT is selected.', 'warning');
  }

  openSettings(): void {
    if (!this.busy && this.hasInstalledModel) this.settingsOpen = true;
  }

  onSettingsKeydown(event: KeyboardEvent): void {
    if (!this.settingsOpen || event.key !== 'Tab') return;
    const modal = event.currentTarget as HTMLElement;
    const first = modal.shadowRoot?.querySelector<HTMLButtonElement>('dialog button');
    const last = modal.querySelector<HTMLButtonElement>('[slot="footer"] button');
    if (!first || !last) return;
    // Chromium can yield to browser chrome after the last dialog control.
    // Keep the desktop app's Tab cycle inside Candor's native modal instead.
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    } else if (event.shiftKey && modal.shadowRoot?.activeElement === first) {
      event.preventDefault(); last.focus();
    }
  }
  recordedAudio: Blob | null = null;
  private recordingTimer?: ReturnType<typeof setInterval>;
  private modelsTimer?: ReturnType<typeof setInterval>;
  private destroyed = false;

  availableModels: Array<{ id: string; name: string; installed: boolean; languages?: string[] }> = [];
  modelsLoading = true;
  modelsLoadError = false;
  private loadingModels = false;

  languages = [
    { code: 'auto', name: 'Auto Detect' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
  ];


  constructor(
    private electronService: ElectronService,
    private toastService: ToastService,
    private ngZone: NgZone,
    private audioRecorder: AudioRecorderService
  ) {}

  ngOnInit() {
    this.loadAvailableModels();
    this.modelChanges = this.electronService.modelsChanged?.subscribe(() => this.loadAvailableModels());

    // Set up event listeners
    this.electronService.onTranscriptionProgress((data) => {
      this.ngZone.run(() => {
        this.transcriptionProgress = data.progress || 0;
        this.progressMessage = data.message || '';
      });
    });

    // Listen for transcription completion
    (window as any).electronAPI?.onTranscriptionCompleted?.((result: any) => {
      this.ngZone.run(() => {
        this.transcriptionResult = result;
        this.isTranscribing = false;
        this.transcriptionProgress = 100;
        this.recordedAudio = null;
        this.copied = false;
        this.copyError = '';
      });
    });

    // Listen for transcription errors
    (window as any).electronAPI?.onTranscriptionError?.((error: string) => {
      this.ngZone.run(() => {
        this.isTranscribing = false;
        this.transcriptionProgress = 0;
        this.recordingError = this.recordedAudio
          ? `${error || 'Transcription failed'}. Your recording is available to retry.`
          : error || 'Transcription failed. Try transcribing this file again.';
      });
    });

    // Refresh models periodically to catch newly downloaded models
    this.modelsTimer = setInterval(() => {
      this.loadAvailableModels();
    }, 5000); // Check every 5 seconds
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.modelChanges?.unsubscribe();
    this.audioRecorder.discard();
    clearInterval(this.recordingTimer);
    clearInterval(this.modelsTimer);
    ['transcription-progress', 'transcription-completed', 'transcription-error'].forEach(channel =>
      this.electronService.removeAllListeners?.(channel));
  }

  async loadAvailableModels() {
    if (this.loadingModels) return;
    this.loadingModels = true;
    try {
      const models = await this.electronService.getAvailableModels();
      if (this.destroyed) return;
      this.modelsLoadError = false;
      this.availableModels = models
        .filter((m: any) => m.installed && m.available !== false) // Only show installed models
        .map((m: any) => ({
          id: m.name,
          name: `${m.displayName || m.name} (${m.size})`,
          languages: m.languages,
          installed: m.installed,
        }));

      // Set default to first installed model if current selection not installed
      if (this.availableModels.length > 0) {
        const currentModelInstalled = this.availableModels.some(
          (m) => m.id === this.selectedModel
        );
        if (!currentModelInstalled) {
          this.selectedModel = this.availableModels.find(model => model.id === 'base')?.id || this.availableModels[0].id;
        }
        this.onModelChange();
      }
    } catch (error) {
      this.modelsLoadError = true;
      console.error('Failed to load models:', error);
    } finally {
      this.modelsLoading = false;
      this.loadingModels = false;
    }
  }

  get supportedLanguages() {
    const allowed = this.availableModels.find(model => model.id === this.selectedModel)?.languages;
    return this.languages.filter(language => language.code === 'auto' || !allowed || allowed.includes(language.code));
  }

  onModelChange() {
    if (!this.supportedLanguages.some(language => language.code === this.selectedLanguage)) this.selectedLanguage = 'auto';
    saveModelPreference(this.selectedModel);
  }

  async selectAudioFile() {
    if (this.busy) return;
    this.switchWorkflow('file');
    this.isSelectingFile = true;
    try {
      const fileData = await this.electronService.selectAudioFile();
      if (this.destroyed) return;
      if (fileData) {
        this.recordedAudio = null;
        this.recordedDurationMs = null;
        this.resetUI();
        // Handle both old string format and new object format for backwards compatibility
        if (typeof fileData === 'string') {
          this.selectedFilePath = fileData;
          this.selectedFileSize = null;
        } else if (
          fileData &&
          typeof fileData === 'object' &&
          'path' in fileData
        ) {
          this.selectedFilePath = (fileData as any).path;
          this.selectedFileSize = (fileData as any).size;
        }
      }
    } catch (error) {
      this.toastService.show('Failed to select file', 'error');
    } finally {
      this.isSelectingFile = false;
    }
  }

  async startTranscription() {
    if (this.busy) return;
    if (this.recordedAudio) {
      await this.transcribeRecording();
      return;
    }
    if (!this.selectedFilePath) {
      this.toastService.show('Please select an audio file', 'info');
      return;
    }

    this.isTranscribing = true;
    this.transcriptionProgress = 0;
    this.transcriptionResult = null;
    this.recordingError = '';
    this.progressMessage = '';
    this.copied = false;
    this.copyError = '';

    try {
      const options = {
        model: this.selectedModel,
        language:
          this.selectedLanguage === 'auto' ? undefined : this.selectedLanguage,
        timestamps: true,
        threads: 4,
      };

      const result = await this.electronService.transcribeAudio(
        this.selectedFilePath,
        options
      );

      if (result.success && result.data) {
        // Job started successfully, progress and completion handled by event listeners
      } else {
        this.isTranscribing = false;
        throw new Error(result.error || 'Failed to start transcription');
      }
    } catch (error: any) {
      this.handleError(error);
    }
  }

  async saveTranscript() {
    if (this.isSaving) return;
    if (!this.transcriptionResult) {
      this.toastService.show('No transcript to save', 'info');
      return;
    }
    if (!['txt', 'srt', 'vtt', 'json'].includes(this.exportFormat)) {
      this.exportFormat = 'txt';
      this.toastService.show('Choose a file format, then save again. TXT is selected.', 'warning');
      return;
    }
    if (!this.canSaveTranscript) {
      this.toastService.show('No speech text to export. Use JSON for diagnostics, or record again.', 'warning');
      return;
    }

    this.isSaving = true;
    try {
      const savedPath = await this.electronService.saveTranscript(
        {
          ...this.transcriptionResult, timestampedText: this.getTranscriptText(),
          pauseRegions: groupQuietIntervals(this.transcriptionResult.quietIntervals || []),
        }, this.exportFormat
      );
      if (savedPath) {
        this.toastService.show(`Saved to: ${savedPath}`, 'success');
      }
    } catch (error) {
      this.toastService.show(String(error).includes('No speech text') ? 'No speech text to export. Use JSON for diagnostics, or record again.' : 'Failed to save transcript', 'error');
    } finally {
      this.isSaving = false;
    }
  }

  get busy(): boolean {
    return this.isRecording || this.isStartingRecording || this.isStoppingRecording || this.isTranscribing || this.isSelectingFile;
  }

  get hasTranscriptText(): boolean {
    const result = this.transcriptionResult;
    return Boolean((typeof result?.text === 'string' && result.text.trim()) || result?.segments?.some((segment: any) => typeof segment?.text === 'string' && segment.text.trim()));
  }

  get canSaveTranscript(): boolean {
    if (!this.transcriptionResult) return false;
    if (this.exportFormat === 'json') return true;
    return this.exportFormat === 'txt' ? Boolean(this.getTranscriptText().trim()) : this.hasTranscriptText;
  }

  switchWorkflow(mode: 'record' | 'file'): void {
    if (this.busy || mode === this.inputMode) return;
    this.workflowSnapshots[this.inputMode] = {
      selectedFilePath: this.selectedFilePath, selectedFileSize: this.selectedFileSize,
      transcriptionResult: this.transcriptionResult, recordedAudio: this.recordedAudio,
      recordedDurationMs: this.recordedDurationMs, elapsedSeconds: this.elapsedSeconds,
      recordingError: this.recordingError, copyError: this.copyError,
      copied: this.copied, includeTimestamps: this.includeTimestamps,
    };
    this.inputMode = mode;
    Object.assign(this, this.workflowSnapshots[mode] || {
      selectedFilePath: null, selectedFileSize: null, transcriptionResult: null,
      recordedAudio: null, recordedDurationMs: null, elapsedSeconds: 0,
      recordingError: '', copyError: '', copied: false, includeTimestamps: true,
    });
    delete this.workflowSnapshots[mode];
    this.progressMessage = '';
    this.transcriptionProgress = 0;
  }

  onWorkflowTabKeydown(event: KeyboardEvent): void {
    if (this.busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const mode = event.key === 'Home' ? 'record' : event.key === 'End' ? 'file'
      : this.inputMode === 'record' ? 'file' : 'record';
    this.switchWorkflow(mode);
    (mode === 'record' ? this.recordTab : this.fileTab)?.nativeElement.focus();
  }

  get hasInstalledModel(): boolean {
    return this.availableModels.some(model => model.id === this.selectedModel && model.installed);
  }

  get hasTiming(): boolean {
    const result = this.transcriptionResult;
    return Boolean(result?.segments?.length || result?.quietIntervals?.length || result?.noSpeechIntervals?.length);
  }

  get workflowTitle(): string {
    if (this.isSelectingFile) return 'Choosing an audio file';
    if (this.isTranscribing) return this.inputMode === 'record' ? 'Transcribing · microphone off' : 'Transcribing your audio file';
    if (this.isStoppingRecording) return 'Finishing recording · microphone off';
    if (this.isStartingRecording) return 'Starting your microphone';
    if (this.isRecording) return 'Recording · microphone on';
    if (this.transcriptionResult) return this.copied ? 'Copied — ready to paste' : 'Your transcript is ready';
    if (!this.hasInstalledModel && this.modelsLoading) return 'Checking local models';
    if (!this.hasInstalledModel && this.modelsLoadError) return 'Could not check local models';
    if (!this.hasInstalledModel) return 'Set up local transcription';
    if (this.recordedAudio) return 'Your recording is ready to retry';
    if (this.selectedFilePath) return 'Ready to transcribe your file';
    return this.inputMode === 'record' ? 'Ready to record' : 'Choose an audio file';
  }

  get workflowStep(): string {
    return `Step ${this.currentStep} of 3 · ${this.currentStep === 3 ? 'Copy' : this.currentStep === 2 ? 'Transcribe' : this.inputMode === 'record' ? 'Record' : 'Choose audio'}`;
  }

  get currentStep(): number {
    if (this.transcriptionResult && !this.busy) return 3;
    if (this.isRecording || this.isTranscribing || this.isStoppingRecording || this.recordedAudio || (this.inputMode === 'file' && this.selectedFilePath)) return 2;
    return 1;
  }

  get workflowHint(): string {
    if (this.isSelectingFile) return 'Choose a file or cancel the dialog to change settings or switch audio source.';
    if (this.isRecording) return 'Stop & transcribe turns off the microphone and starts transcription. Finish transcription to copy, save, change settings or switch audio source.';
    if (this.isTranscribing || this.isStoppingRecording) return `${this.progressMessage || 'Processing audio on this device…'} Finish transcription to copy, save, change settings or switch audio source.`;
    if (this.isStartingRecording) return 'Allow microphone access if prompted. Recording will begin automatically; stop and transcribe to change settings or switch audio source.';
    if (this.transcriptionResult) return this.copied
      ? `Copied ${this.includeTimestamps && this.hasTiming ? 'with timing and pauses' : 'as plain text'}. Paste into your chat or terminal.`
      : `Ready to copy ${this.includeTimestamps && this.hasTiming ? 'with timing and pauses' : 'as plain text'}.`;
    if (!this.hasInstalledModel && this.modelsLoading) return 'Checking models on this device. Record and Transcribe become available when this check finishes.';
    if (!this.hasInstalledModel && this.modelsLoadError) return 'The model check failed. Retrying automatically; your downloaded models have not been removed.';
    if (!this.hasInstalledModel) return 'Download a speech model to enable recording, transcription and settings. Copy and Save require a completed transcript.';
    if (this.recordedAudio) return `Your recording is retained. Choose Retry transcription, or ${this.recordActionLabel} to start again.`;
    if (this.selectedFilePath) return 'Your file is ready. Transcribe file to enable Copy and Save; open Transcription settings to adjust the model or language.';
    return this.inputMode === 'record'
      ? 'Start recording (up to 30 minutes) to enable Stop & transcribe. Copy and Save become available after transcription.'
      : 'Choose an audio file to enable Transcribe file. Copy and Save become available after transcription.';
  }

  get recordActionLabel(): string {
    return this.recordedAudio || this.transcriptionResult ? 'Record another' : 'Record answer';
  }

  async startRecording(): Promise<void> {
    if (this.busy) return;
    this.switchWorkflow('record');
    if (!this.hasInstalledModel) {
      this.recordingError = 'Download a model in the Models tab before recording.';
      return;
    }
    this.recordingError = '';
    this.isStartingRecording = true;
    try {
      await this.audioRecorder.start(
        () => this.ngZone.run(() => { void this.stopRecording(); }),
        message => this.ngZone.run(() => {
          this.isRecording = false;
          this.isStartingRecording = false;
          this.recordingStartedAt = undefined;
          this.recordedDurationMs = null;
          clearInterval(this.recordingTimer);
          this.recordingError = message;
        })
      );
      if (this.destroyed) return;
      this.resetUI();
      this.recordedAudio = null;
      this.selectedFilePath = null;
      this.elapsedSeconds = 0;
      this.recordedDurationMs = null;
      this.isRecording = true;
      this.recordingStartedAt = performance.now();
      this.recordingTimer = setInterval(() => {
        this.elapsedSeconds = Math.floor((performance.now() - this.recordingStartedAt!) / 1000);
        if (this.elapsedSeconds >= MAX_RECORDING_SECONDS) void this.stopRecording();
      }, 250);
    } catch (error: any) {
      if (!this.destroyed) this.recordingError = error.message;
    } finally {
      this.isStartingRecording = false;
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.isRecording) return;
    // Snapshot at Stop, before finalizing the Blob or running transcription.
    this.recordedDurationMs = Math.max(0, Math.round(this.recordingStartedAt === undefined
      ? this.elapsedSeconds * 1000 : performance.now() - this.recordingStartedAt));
    this.recordingStartedAt = undefined;
    this.isRecording = false;
    this.isStoppingRecording = true;
    clearInterval(this.recordingTimer);
    try {
      this.recordedAudio = await this.audioRecorder.stop();
      if (!this.destroyed) await this.transcribeRecording();
    } catch (error: any) {
      if (!this.destroyed) this.recordingError = error.message;
    } finally {
      this.isStoppingRecording = false;
    }
  }

  discardRecording(): void {
    if (this.isTranscribing || this.isStoppingRecording) return;
    this.audioRecorder.discard();
    clearInterval(this.recordingTimer);
    this.isRecording = false;
    this.recordedAudio = null;
    this.recordingError = '';
    this.elapsedSeconds = 0;
    this.recordedDurationMs = null;
    this.recordingStartedAt = undefined;
  }

  private async transcribeRecording(): Promise<void> {
    if (!this.recordedAudio || this.isTranscribing) return;
    this.isTranscribing = true;
    this.transcriptionResult = null;
    this.transcriptionProgress = 0;
    this.recordingError = '';
    this.progressMessage = '';
    this.copied = false;
    this.copyError = '';
    try {
      const bytes = new Uint8Array(await this.recordedAudio.arrayBuffer());
      if (this.destroyed) return;
      const result = await this.electronService.transcribeRecording(bytes, {
        model: this.selectedModel,
        language: this.selectedLanguage === 'auto' ? undefined : this.selectedLanguage,
      });
      if (!result.success) throw new Error(result.error || 'Failed to start transcription');
    } catch (error: any) {
      this.isTranscribing = false;
      this.recordingError = `${error.message}. Your recording is available to retry.`;
    }
  }

  get recordingDuration(): string {
    const milliseconds = this.isRecording ? this.elapsedSeconds * 1000 : this.recordedDurationMs;
    if (milliseconds === null) return '—';
    const minutes = Math.floor(milliseconds / 60000).toString().padStart(2, '0');
    const seconds = Math.floor(milliseconds % 60000 / 1000).toString().padStart(2, '0');
    return `${minutes}:${seconds}${this.isRecording ? '' : '.' + (milliseconds % 1000).toString().padStart(3, '0')}`;
  }

  private resetUI() {
    this.transcriptionResult = null;
    this.transcriptionProgress = 0;
    this.progressMessage = '';
    this.isTranscribing = false;
    this.selectedFileSize = null;
    this.recordingError = '';
    this.copied = false;
    this.copyError = '';
  }

  private handleError(error: any) {
    this.isTranscribing = false;
    this.transcriptionProgress = 0;
    this.recordingError = error.message || 'Transcription failed. Try again.';
    console.error('Transcription error:', error);
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  getFileName(): string {
    if (this.selectedFilePath) {
      return this.selectedFilePath.split(/[\\/]/).pop() || '';
    }
    return '';
  }

  formatTimestampRange(start: number, end: number): string {
    return `[${this.formatTimestamp(start)} → ${this.formatTimestamp(end)}]`;
  }

  formatTimestamp(seconds: number): string {
    const milliseconds = Math.round(Math.max(0, seconds) * 1000);
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor((milliseconds % 3600000) / 60000);
    const secs = (milliseconds % 60000) / 1000;

    const hh = hours.toString().padStart(2, '0');
    const mm = minutes.toString().padStart(2, '0');
    const ss = secs.toFixed(3).padStart(6, '0');

    return `${hh}:${mm}:${ss}`;
  }

  async copyToClipboard(): Promise<void> {
    if (!this.transcriptionResult) {
      return;
    }

    const content = this.getTranscriptText();

    this.copyError = '';
    try {
      await navigator.clipboard.writeText(content);
      this.ngZone.run(() => {
        this.copied = true;
      });
    } catch (error) {
      this.ngZone.run(() => {
        this.copied = false;
        this.copyError = 'Could not copy. Try again or save the transcript to a file.';
        console.error('Clipboard error:', error);
      });
    }
  }

  exportTranscript(): void {
    this.saveTranscript();
  }

  getTranscriptText(): string {
    const result = this.transcriptionResult;
    if (!result) return '';
    if (typeof result === 'string') return result;
    if (this.includeTimestamps && (result.segments?.length || result.quietIntervals?.length || result.noSpeechIntervals?.length)) {
      const timeline = this.timelineEntries;
      const text = timeline.map(entry =>
        `${this.formatTimestampRange(entry.start, entry.end)} ${entry.text}`
      ).join('\n');
      const unaligned = !result.segments?.length && result.text?.trim() ? `Recognition text (speech timing unavailable):\n${result.text}\n\n` : '';
      const hasPauses = timeline.some(entry => entry.kind !== 'speech');
      const timing = (result.timingMethod === 'whisper-dtw' || result.timingMethod === 'transducer-tokens')
        ? 'Speech ranges use audio-aligned token locations: estimates, not exact word boundaries.'
        : 'Speech times are approximate and may overlap pause regions.';
      const pauses = hasPauses || result.noSpeechIntervals !== undefined ? ` ${this.pauseDescription}` : '';
      const warnings = [result.alignmentWarning, result.speechDetectionWarning].filter(Boolean).join(' ');
      return hasPauses || result.noSpeechIntervals !== undefined || ['whisper-dtw', 'transducer-tokens'].includes(result.timingMethod) || warnings
        ? `Timeline ordered by start time. ${timing}${pauses}${warnings ? ' ' + warnings : ''}\n\n${unaligned}${text}` : unaligned + text;
    }
    return result.text || '';
  }

  get timelineEntries(): TimelineEntry[] {
    return buildTranscriptTimeline(this.transcriptionResult || {});
  }

  get transcriptMetadata(): Array<{ label: string; value: string }> {
    const { duration, processingTimeMs, modelName, model } = this.transcriptionResult || {};
    const rows: Array<{ label: string; value: string }> = [];
    if (modelName || model) rows.push({ label: 'Model', value: modelName || model });
    if (Number.isFinite(duration) && duration >= 0) rows.push({ label: 'Audio length', value: `${duration.toFixed(2)} s` });
    if (Number.isFinite(processingTimeMs) && processingTimeMs >= 0) rows.push({ label: 'Processing', value: `${(processingTimeMs / 1000).toFixed(2)} s` });
    if (duration > 0 && Number.isFinite(duration) && processingTimeMs > 0 && Number.isFinite(processingTimeMs)) {
      rows.push({ label: 'Speed', value: `${(duration / (processingTimeMs / 1000)).toFixed(1)}× real time` });
    }
    return rows;
  }

  get performanceSummary(): string {
    const { duration, processingTimeMs, modelName, model } = this.transcriptionResult || {};
    if (!Number.isFinite(processingTimeMs) || processingTimeMs <= 0) return '';
    const audio = Number.isFinite(duration) && duration > 0;
    const seconds = processingTimeMs / 1000;
    const speed = audio ? ` (${(duration / seconds).toFixed(1)}× real time)` : '';
    return `${modelName || model || 'Transcription'} · ${audio ? duration.toFixed(2) + ' s audio · ' : ''}${seconds.toFixed(2)} s processing${speed}`;
  }

  get timingDescription(): string {
    return ['whisper-dtw', 'transducer-tokens'].includes(this.transcriptionResult?.timingMethod)
      ? 'Speech ranges use audio-aligned token locations. They are estimates, not exact word boundaries.'
      : 'Speech times are approximate and may overlap pause regions.';
  }

  get pauseDescription(): string {
    return this.transcriptionResult?.noSpeechIntervals !== undefined
      ? 'No speech detected marks gaps of at least 1.5 s estimated by a local speech detector. Background sounds may remain; faint or brief speech can be missed. Recognition text is preserved even where the detectors disagree. These gaps do not establish thinking time.'
      : 'Pause regions group low-level audio across interruptions of up to 1.5 s; interruptions may include sounds or brief speech. They do not establish thinking time.';
  }
}
