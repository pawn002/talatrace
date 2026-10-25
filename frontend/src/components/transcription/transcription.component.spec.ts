import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranscriptionComponent } from './transcription.component';
import { ElectronService } from '../../services/electron.service';
import { ToastService } from '../../services/toast.service';
import { AudioRecorderService } from '../../services/audio-recorder.service';
import { AudioSpectrumComponent } from '../audio-spectrum/audio-spectrum.component';

const electronStub = {
  getAvailableModels: jest.fn().mockResolvedValue([]),
  onTranscriptionProgress: jest.fn(),
  onTranscriptionCompleted: jest.fn(),
  onTranscriptionError: jest.fn(),
  selectAudioFile: jest.fn(),
  transcribeAudio: jest.fn(),
  saveTranscript: jest.fn(),
  transcribeRecording: jest.fn(),
};

const toastStub = {
  show: jest.fn(),
};

describe('TranscriptionComponent', () => {
  let component: TranscriptionComponent;
  let fixture: ComponentFixture<TranscriptionComponent>;

  it('reports comparable processing time and audio duration from the completed result', () => {
    component.transcriptionResult = { duration: 38.52, processingTimeMs: 6420, modelName: 'Parakeet' };
    expect(component.performanceSummary).toBe('Parakeet · 38.52 s audio · 6.42 s processing (6.0× real time)');
    component.selectedModel = 'base';
    expect(component.performanceSummary).toContain('Parakeet');
    component.transcriptionResult = { processingTimeMs: 5000 };
    expect(component.performanceSummary).not.toContain('real time');
    component.transcriptionResult = { duration: 0, processingTimeMs: 0 };
    expect(component.performanceSummary).toBe('');
  });

  it('preserves untimed recognition alongside independent pause metadata', () => {
    component.transcriptionResult = { text: 'Keep the complete answer', noSpeechIntervals: [{ start: 2, end: 5 }], alignmentWarning: 'Timing unavailable' };
    component.includeTimestamps = true;
    expect(component.getTranscriptText()).toContain('Keep the complete answer');
    expect(component.getTranscriptText()).toContain('No speech detected');
  });

  it('resets an unsupported language when selecting Parakeet', () => {
    component.availableModels = [{ id: 'parakeet-tdt-0.6b-v3', name: 'Parakeet', installed: true, languages: ['en', 'fr'] }];
    component.selectedModel = 'parakeet-tdt-0.6b-v3';
    component.selectedLanguage = 'ja';
    component.onModelChange();
    expect(component.selectedLanguage).toBe('auto');
    expect(component.supportedLanguages.map(language => language.code)).toEqual(['auto', 'en', 'fr']);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    electronStub.getAvailableModels.mockResolvedValue([]);

    await TestBed.configureTestingModule({
      declarations: [TranscriptionComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      imports: [FormsModule, AudioSpectrumComponent],
      providers: [
        { provide: ElectronService, useValue: electronStub },
        { provide: ToastService, useValue: toastStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranscriptionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ─── formatFileSize ───────────────────────────────────────────────────────

  describe('formatFileSize()', () => {
    it('returns "0 Bytes" for 0', () => {
      expect(component.formatFileSize(0)).toBe('0 Bytes');
    });

    it('converts bytes to KB', () => {
      expect(component.formatFileSize(1536)).toBe('1.5 KB');
    });

    it('converts bytes to MB', () => {
      expect(component.formatFileSize(1572864)).toBe('1.5 MB');
    });

    it('converts bytes to GB', () => {
      expect(component.formatFileSize(1610612736)).toBe('1.5 GB');
    });
  });

  // ─── getFileName ─────────────────────────────────────────────────────────

  describe('getFileName()', () => {
    it('returns empty string when no file selected', () => {
      component.selectedFilePath = null;
      expect(component.getFileName()).toBe('');
    });

    it('extracts filename from Unix path', () => {
      component.selectedFilePath = '/home/user/audio/recording.mp3';
      expect(component.getFileName()).toBe('recording.mp3');
    });

    it('extracts filename from Windows path', () => {
      component.selectedFilePath = 'C:\\Users\\user\\audio\\recording.mp3';
      expect(component.getFileName()).toBe('recording.mp3');
    });
  });

  // ─── formatTimestampRange ────────────────────────────────────────────────
  // Replaces the removed getTranscriptionText() — segments are now rendered
  // in the template via formatTimestampRange(segment.start, segment.end).

  describe('formatTimestampRange()', () => {
    it('formats a sub-minute range', () => {
      expect(component.formatTimestampRange(0, 1.5))
        .toBe('[00:00:00.000 → 00:00:01.500]');
    });

    it('formats a range spanning over an hour', () => {
      expect(component.formatTimestampRange(3661, 3662))
        .toBe('[01:01:01.000 → 01:01:02.000]');
    });
  });

  // ─── resetUI via selectAudioFile ──────────────────────────────────────────

  it('resets UI state when a new file is selected', async () => {
    component.transcriptionResult = { text: 'old result' };
    component.isTranscribing = false;
    component.transcriptionProgress = 80;
    electronStub.selectAudioFile.mockResolvedValue({ path: '/audio/new.mp3', size: 1024 });

    await component.selectAudioFile();

    expect(component.transcriptionResult).toBeNull();
    expect(component.isTranscribing).toBe(false);
    expect(component.transcriptionProgress).toBe(0);
  });

  // ─── startTranscription guard ─────────────────────────────────────────────

  it('keeps the previous file and transcript when choosing another file is cancelled', async () => {
    component.inputMode = 'file';
    component.selectedFilePath = '/audio/previous.wav';
    const previousResult = { text: 'Previous answer' };
    component.transcriptionResult = previousResult;
    electronStub.selectAudioFile.mockResolvedValue(null);
    await component.selectAudioFile();
    expect(component.selectedFilePath).toBe('/audio/previous.wav');
    expect(component.transcriptionResult).toBe(previousResult);
  });

  it('shows a toast and returns early when no file is selected', async () => {
    component.selectedFilePath = null;

    await component.startTranscription();

    expect(toastStub.show).toHaveBeenCalledWith('Please select an audio file', 'info');
    expect(component.isTranscribing).toBe(false);
  });


  // ─── loadAvailableModels ──────────────────────────────────────────────────

  describe('loadAvailableModels()', () => {
    it('filters to only installed models', async () => {
      electronStub.getAvailableModels.mockResolvedValue([
        { name: 'base', size: '74 MB', installed: true },
        { name: 'small', size: '244 MB', installed: false },
      ]);

      await component.loadAvailableModels();

      expect(component.availableModels.length).toBe(1);
      expect(component.availableModels[0].id).toBe('base');
    });

    it('keeps the current model selection when it is still available', async () => {
      component.selectedModel = 'base';
      electronStub.getAvailableModels.mockResolvedValue([
        { name: 'base', size: '74 MB', installed: true },
        { name: 'small', size: '244 MB', installed: true },
      ]);

      await component.loadAvailableModels();

      expect(component.selectedModel).toBe('base');
    });

    it('falls back to the first available model when current selection is not installed', async () => {
      component.selectedModel = 'large';
      electronStub.getAvailableModels.mockResolvedValue([
        { name: 'base', size: '74 MB', installed: true },
      ]);

      await component.loadAvailableModels();

      expect(component.selectedModel).toBe('base');
    });
  });

  // ─── saveTranscript ───────────────────────────────────────────────────────

  describe('Interview recording', () => {
    it('keeps the same record, stop and copy buttons in the DOM throughout the workflow', () => {
      component.availableModels = [{ id: 'base', name: 'Base', installed: true }];
      fixture.detectChanges();
      const controls = [...fixture.nativeElement.querySelectorAll('.workflow-controls button')] as HTMLButtonElement[];
      const [record, stop, copy] = controls;
      expect(controls.map(button => button.textContent?.trim())).toEqual(['Record answer', 'Stop & transcribe', 'Copy transcript']);
      expect(record.disabled).toBe(false);
      expect(stop.disabled).toBe(true);
      expect(copy.disabled).toBe(true);
      expect(component.sourceHint).toBe('');
      component.isRecording = true;
      fixture.detectChanges();
      expect(record.disabled).toBe(true);
      expect(stop.disabled).toBe(false);
      expect(copy.disabled).toBe(true);
      expect(component.workflowTitle).toContain('microphone on');
      component.isRecording = false;
      component.isStoppingRecording = true;
      fixture.detectChanges();
      expect(controls.every(button => button.disabled)).toBe(true);
      component.isStoppingRecording = false;
      component.isTranscribing = true;
      fixture.detectChanges();
      expect(controls.every(button => button.disabled)).toBe(true);
      expect(component.workflowTitle).toContain('microphone off');
      component.isTranscribing = false;
      component.recordedAudio = new Blob(['audio']);
      fixture.detectChanges();
      expect(record.textContent).toContain('Record another');
      expect(fixture.nativeElement.querySelector('[data-action="transcribe"]')).toBeNull();
      component.recordingError = 'Transcription failed';
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-action="transcribe"]').disabled).toBe(false);
      expect(record.disabled).toBe(false);
      expect(fixture.nativeElement.textContent).not.toContain('Discard recording');
      component.recordedAudio = null;
      component.transcriptionResult = { text: 'Answer', segments: [{ start: 0, end: 2, text: 'Answer' }] };
      fixture.detectChanges();
      expect(record.disabled).toBe(false);
      expect(stop.disabled).toBe(true);
      expect(copy.disabled).toBe(false);
      expect(record.textContent).toContain('Record another');
      expect([...fixture.nativeElement.querySelectorAll('.workflow-controls button')]).toEqual(controls);
    });

    it('freezes a millisecond duration at Stop while showing whole seconds during recording', async () => {
      let now = 100;
      const clock = jest.spyOn(performance, 'now').mockImplementation(() => now);
      const recorder = TestBed.inject(AudioRecorderService);
      jest.spyOn(recorder, 'start').mockResolvedValue();
      jest.spyOn(recorder, 'stop').mockResolvedValue({ arrayBuffer: async () => new Uint8Array([1]).buffer } as Blob);
      electronStub.transcribeRecording.mockResolvedValue({ success: true });
      component.availableModels = [{ id: 'base', name: 'Base', installed: true }];
      try {
        await component.startRecording();
        component.elapsedSeconds = 61;
        expect(component.recordingDuration).toBe('01:01');
        now = 61534.6;
        await component.stopRecording();
        expect(component.recordingDuration).toBe('01:01.435');
        now += 5000;
        expect(component.recordingDuration).toBe('01:01.435');
        component.isTranscribing = false;
        component.transcriptionResult = { text: 'Answer' };
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[role="timer"]').textContent).toBe('01:01.435');
        component.discardRecording();
        expect(component.recordingDuration).toBe('—');
      } finally { clock.mockRestore(); }
    });

    it('formats final durations at minute boundaries and clears the old duration for a new recording', async () => {
      component.recordedDurationMs = 60000;
      expect(component.recordingDuration).toBe('01:00.000');
      component.availableModels = [{ id: 'base', name: 'Base', installed: true }];
      jest.spyOn(TestBed.inject(AudioRecorderService), 'start').mockResolvedValue();
      await component.startRecording();
      expect(component.recordedDurationMs).toBeNull();
      expect(component.recordingDuration).toBe('00:00');
    });

    it('makes file transcription the primary action after choosing a file', () => {
      component.availableModels = [{ id: 'base', name: 'Base', installed: true }];
      component.switchWorkflow('file');
      component.selectedFilePath = '/audio/answer.wav';
      component.selectedFileSize = 0;
      fixture.detectChanges();
      const primary = fixture.nativeElement.querySelectorAll('button.button--primary');
      expect(primary).toHaveLength(1);
      expect(primary[0].textContent).toContain('Transcribe file');
      expect(fixture.nativeElement.textContent).toContain('answer.wav');
      const chooseCard = fixture.nativeElement.querySelector('[data-action="choose-file"]').closest('candor-card');
      expect(chooseCard.querySelector('.file-name').textContent).toBe('answer.wav');
      expect(chooseCard.querySelector('.file-size').textContent).toBe('0 Bytes');
      component.isTranscribing = true;
      fixture.detectChanges();
      expect(chooseCard.querySelector('.file-name').textContent).toBe('answer.wav');
    });

    it('separates workflow controls and restores each workflow’s input, transcript and duration', () => {
      const recording = new Blob(['retained audio']);
      component.transcriptionResult = { text: 'Recorded answer' };
      component.recordedAudio = recording;
      component.recordedDurationMs = 32567;
      component.copied = true;
      component.switchWorkflow('file');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-action="record"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-action="stop"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-action="choose-file"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[role="timer"]')).toBeNull();
      expect(component.transcriptionResult).toBeNull();
      expect(component.recordedAudio).toBeNull();
      component.selectedFilePath = '/audio/meeting.wav';
      component.transcriptionResult = { text: 'Imported meeting' };
      component.switchWorkflow('record');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-action="choose-file"]')).toBeNull();
      expect(component.transcriptionResult.text).toBe('Recorded answer');
      expect(component.recordedAudio).toBe(recording);
      expect(component.recordingDuration).toBe('00:32.567');
      expect(component.copied).toBe(true);
      expect(component.selectedFilePath).toBeNull();
      component.switchWorkflow('file');
      expect(component.selectedFilePath).toBe('/audio/meeting.wav');
      expect(component.transcriptionResult.text).toBe('Imported meeting');
    });

    it('supports arrow, Home and End navigation with focus and selected tab state', () => {
      fixture.detectChanges();
      const recordTab = fixture.nativeElement.querySelector('#record-audio-tab') as HTMLButtonElement;
      const fileTab = fixture.nativeElement.querySelector('#audio-file-tab') as HTMLButtonElement;
      recordTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      fixture.detectChanges();
      expect(component.inputMode).toBe('file');
      expect(document.activeElement).toBe(fileTab);
      expect(fileTab.getAttribute('aria-selected')).toBe('true');
      expect(fileTab.tabIndex).toBe(0);
      expect(recordTab.tabIndex).toBe(-1);
      expect(fixture.nativeElement.querySelector('#transcription-workflow-panel').getAttribute('aria-labelledby')).toBe('audio-file-tab');
      fileTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(component.inputMode).toBe('record');
      recordTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(component.inputMode).toBe('file');
      fileTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      expect(component.inputMode).toBe('record');
      expect(document.activeElement).toBe(recordTab);
    });

    it('prevents changing workflows while recording, finalizing, choosing a file or transcribing', () => {
      for (const flag of ['isRecording', 'isStartingRecording', 'isStoppingRecording', 'isSelectingFile', 'isTranscribing'] as const) {
        component[flag] = true;
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('#audio-file-tab').disabled).toBe(true);
        expect(fixture.nativeElement.querySelector('#record-audio-tab').disabled).toBe(false);
        expect(fixture.nativeElement.querySelector('#source-help').textContent).toContain('switch sources');
        component.switchWorkflow('file');
        expect(component.inputMode).toBe('record');
        component[flag] = false;
      }
    });

    it('offers a direct model setup action when no model is installed', () => {
      component.availableModels = [];
      const manage = jest.spyOn(component.manageModels, 'emit');
      fixture.detectChanges();
      const button = fixture.nativeElement.querySelector('button.button--primary');
      expect(button.textContent).toContain('Download a model');
      button.click();
      expect(manage).toHaveBeenCalled();
    });

    it('keeps copy success visible and supports copying the same transcript again', async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      component.transcriptionResult = { text: 'Answer' };
      await component.copyToClipboard();
      fixture.detectChanges();
      expect(component.workflowTitle).toBe('Copied — ready to paste');
      expect(fixture.nativeElement.querySelector('[data-action="copy"]').textContent).toContain('Copy transcript');
      await component.copyToClipboard();
      expect(writeText).toHaveBeenCalledTimes(2);
      expect(writeText).toHaveBeenCalledWith('Answer');
    });

    it('offers a persistent recovery message after clipboard failure', async () => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn().mockRejectedValue(new Error('Clipboard unavailable')) }, configurable: true });
      component.transcriptionResult = { text: 'Answer' };
      await component.copyToClipboard();
      fixture.detectChanges();
      expect(component.copied).toBe(false);
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Try again or save');
    });
    it('copies and exports speech gaps and keeps the raw volume measurements', async () => {
      component.transcriptionResult = {
        text: '', noSpeechIntervals: [{ start: 6, end: 36 }], speechIntervals: [],
        speechDetectionMethod: 'silero-v5.1.2', quietIntervals: [{ start: 12, end: 14 }],
      };
      expect(component.getTranscriptText()).toContain('[00:00:06.000 → 00:00:36.000] No speech detected (30.0 s)');
      expect(component.getTranscriptText()).toContain('faint or brief speech can be missed');
      expect(component.getTranscriptText()).not.toContain('Pause region (');
      await component.saveTranscript();
      expect(electronStub.saveTranscript).toHaveBeenCalledWith(expect.objectContaining({
        noSpeechIntervals: [{ start: 6, end: 36 }], quietIntervals: [{ start: 12, end: 14 }],
      }));
    });

    it('copies the detector warning when only quiet measurements are available', () => {
      component.transcriptionResult = {
        text: 'Answer', segments: [{ start: 0, end: 2, text: 'Answer' }],
        speechDetectionWarning: 'Speech detection unavailable.',
      };
      expect(component.getTranscriptText()).toContain('Speech detection unavailable.');
    });
    it('copies readable timestamp ranges and preserves gaps in the audio timeline', () => {
      component.transcriptionResult = { text: 'First. Second.', segments: [
        { start: 3.2, end: 8.7, text: ' First. ' },
        { start: 13.1, end: 19.4, text: 'Second.' },
      ] };
      expect(component.getTranscriptText()).toBe(
        '[00:00:03.200 → 00:00:08.700] First.\n[00:00:13.100 → 00:00:19.400] Second.'
      );
      component.includeTimestamps = false;
      expect(component.getTranscriptText()).toBe('First. Second.');
    });

    it('carries millisecond rounding correctly across a minute boundary', () => {
      expect(component.formatTimestampRange(59.9999, 60.1)).toBe('[00:01:00.000 → 00:01:00.100]');
    });

    it('includes measured quiet intervals even when a speech segment spans a pause', () => {
      component.transcriptionResult = {
        text: 'An answer', segments: [{ start: 0, end: 10, text: 'An answer' }],
        quietIntervals: [{ start: 3, end: 7 }],
      };
      expect(component.getTranscriptText()).toContain('[00:00:03.000 → 00:00:07.000] Pause region (4.0 s quiet)');
      expect(component.getTranscriptText()).toContain('Speech times are approximate and may overlap pause regions');
      component.includeTimestamps = false;
      expect(component.getTranscriptText()).toBe('An answer');
    });

    it('exports the same readable timestamped text that Copy uses', async () => {
      component.transcriptionResult = { text: 'Answer', segments: [{ start: 2, end: 4, text: 'Answer' }] };
      await component.saveTranscript();
      expect(electronStub.saveTranscript).toHaveBeenCalledWith(expect.objectContaining({
        timestampedText: '[00:00:02.000 → 00:00:04.000] Answer',
      }));
    });

    it('copies audio-aligned times while retaining original recognition times in exports', async () => {
      component.transcriptionResult = {
        text: 'Resumed speech', timingMethod: 'whisper-dtw',
        segments: [{ start: 75.8, end: 80.4, text: 'Resumed speech' }],
        originalSegments: [{ start: 59, end: 82, text: 'Resumed speech' }],
      };
      expect(component.getTranscriptText()).toContain('audio-aligned token locations');
      expect(component.getTranscriptText()).toContain('[00:01:15.800 → 00:01:20.400] Resumed speech');
      await component.saveTranscript();
      expect(electronStub.saveTranscript).toHaveBeenCalledWith(expect.objectContaining({
        originalSegments: [{ start: 59, end: 82, text: 'Resumed speech' }],
      }));
    });

    it('blocks new file selection during a transcription', async () => {
      component.isTranscribing = true;
      await component.selectAudioFile();
      expect(electronStub.selectAudioFile).not.toHaveBeenCalled();
    });

    it('requires an installed model before microphone capture', async () => {
      component.availableModels = [];
      await component.startRecording();
      expect(component.recordingError).toContain('Download a model');
      expect(component.isRecording).toBe(false);
    });

    it('automatically sends finalized audio to local transcription when stopped', async () => {
      const recorder = TestBed.inject(AudioRecorderService);
      jest.spyOn(recorder, 'start').mockResolvedValue();
      const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
      jest.spyOn(recorder, 'stop').mockResolvedValue({ arrayBuffer: async () => bytes.buffer } as Blob);
      electronStub.transcribeRecording.mockResolvedValue({ success: true, data: { id: 'recording' } });
      component.availableModels = [{ id: 'base', name: 'Base', installed: true }];
      await component.startRecording();
      expect(component.isRecording).toBe(true);
      await component.stopRecording();
      expect(electronStub.transcribeRecording).toHaveBeenCalledWith(bytes, { model: 'base', language: undefined });
      expect(component.isTranscribing).toBe(true);
    });

    it('retains captured audio for retry when the local engine cannot start', async () => {
      component.recordedAudio = { arrayBuffer: async () => new Uint8Array([1]).buffer } as Blob;
      electronStub.transcribeRecording.mockResolvedValue({ success: false, error: 'Model unavailable' });
      await component.startTranscription();
      expect(component.recordedAudio).not.toBeNull();
      expect(component.recordingError).toContain('available to retry');
      expect(component.isTranscribing).toBe(false);
      component.availableModels = [{ id: 'base', name: 'Base', installed: true }];
      jest.spyOn(TestBed.inject(AudioRecorderService), 'start').mockResolvedValue();
      await component.startRecording();
      expect(component.isRecording).toBe(true);
      expect(component.recordedAudio).toBeNull();
      expect(component.recordingError).toBe('');
    });
  });

  describe('saveTranscript()', () => {
    it('shows info toast and does not call electron when there is no result', async () => {
      component.transcriptionResult = null;

      await component.saveTranscript();

      expect(electronStub.saveTranscript).not.toHaveBeenCalled();
      expect(toastStub.show).toHaveBeenCalledWith('No transcript to save', 'info');
    });

    it('shows success toast with the saved path on success', async () => {
      component.transcriptionResult = { text: 'hello' };
      electronStub.saveTranscript.mockResolvedValue('/output/transcript.txt');

      await component.saveTranscript();

      expect(toastStub.show).toHaveBeenCalledWith(
        expect.stringContaining('/output/transcript.txt'),
        'success',
      );
    });

    it('shows error toast when saving fails', async () => {
      component.transcriptionResult = { text: 'hello' };
      electronStub.saveTranscript.mockRejectedValue(new Error('disk full'));

      await component.saveTranscript();

      expect(toastStub.show).toHaveBeenCalledWith('Failed to save transcript', 'error');
    });
  });


  // ─── IPC callbacks registered in ngOnInit ────────────────────────────────
  //
  // These callbacks are closures registered at startup via window.electronAPI
  // and electronService.onTranscriptionProgress. To capture them we must mock
  // the registration points BEFORE fixture.detectChanges() triggers ngOnInit,
  // so we re-create the component in a nested beforeEach.

  describe('IPC callbacks registered in ngOnInit', () => {
    let completedCallback: (result: any) => void;
    let errorCallback: (error: string) => void;
    let progressCallback: (data: { progress: number; message?: string }) => void;

    beforeEach(() => {
      // Capture the callback passed to electronService.onTranscriptionProgress
      electronStub.onTranscriptionProgress.mockImplementation((cb: any) => {
        progressCallback = cb;
      });

      // Capture completion/error callbacks registered directly on window.electronAPI
      (window as any).electronAPI = {
        onTranscriptionCompleted: (cb: any) => { completedCallback = cb; },
        onTranscriptionError: (cb: any) => { errorCallback = cb; },
      };

      // Re-create so ngOnInit fires with the mocks above in place
      fixture = TestBed.createComponent(TranscriptionComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    afterEach(() => {
      delete (window as any).electronAPI;
    });

    // onTranscriptionProgress ──────────────────────────────────────────────

    describe('onTranscriptionProgress', () => {
      it('updates transcriptionProgress', () => {
        progressCallback({ progress: 42 });
        expect(component.transcriptionProgress).toBe(42);
      });

      it('updates progressMessage', () => {
        progressCallback({ progress: 50, message: 'Loading model...' });
        expect(component.progressMessage).toBe('Loading model...');
      });

      it('defaults progressMessage to empty string when message is absent', () => {
        progressCallback({ progress: 10 });
        expect(component.progressMessage).toBe('');
      });
    });

    // onTranscriptionCompleted ─────────────────────────────────────────────

    describe('onTranscriptionCompleted', () => {
      it('sets transcriptionResult from the payload', () => {
        completedCallback({ text: 'hello world' });
        expect(component.transcriptionResult).toEqual({ text: 'hello world' });
      });

      it('clears isTranscribing', () => {
        component.isTranscribing = true;
        completedCallback({ text: 'done' });
        expect(component.isTranscribing).toBe(false);
      });

      it('sets transcriptionProgress to 100', () => {
        component.transcriptionProgress = 50;
        completedCallback({ text: 'done' });
        expect(component.transcriptionProgress).toBe(100);
      });

      it('announces completion in the persistent status without an overlapping toast', () => {
        completedCallback({ text: 'done' });
        expect(component.workflowTitle).toBe('Your transcript is ready');
        expect(toastStub.show).not.toHaveBeenCalledWith('Transcription completed!', 'success');
      });
    });

    // onTranscriptionError ─────────────────────────────────────────────────

    describe('onTranscriptionError', () => {
      it('clears isTranscribing', () => {
        component.isTranscribing = true;
        errorCallback('Something failed');
        expect(component.isTranscribing).toBe(false);
      });

      it('resets transcriptionProgress to 0', () => {
        component.transcriptionProgress = 75;
        errorCallback('Something failed');
        expect(component.transcriptionProgress).toBe(0);
      });

      it('keeps the error inline rather than duplicating it in a toast', () => {
        errorCallback('Whisper binary not found');
        expect(component.recordingError).toBe('Whisper binary not found');
        expect(toastStub.show).not.toHaveBeenCalledWith('Whisper binary not found', 'error');
      });

      it('falls back to a default message when the error string is falsy', () => {
        errorCallback('');
        expect(component.recordingError).toContain('Transcription failed');
      });
    });
  });
});
