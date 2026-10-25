import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { HistoryComponent } from './history.component';
import { ElectronService } from '../../services/electron.service';
import { ToastService } from '../../services/toast.service';

const electronStub: Partial<ElectronService> = {
  getTranscriptionHistory: jest.fn().mockResolvedValue([]),
  onTranscriptionCompleted: jest.fn(),
  onTranscriptionError: jest.fn(),
  removeAllListeners: jest.fn(),
};

const toastStub: Partial<ToastService> = {
  show: jest.fn(),
};

describe('HistoryComponent', () => {
  let component: HistoryComponent;
  let fixture: ComponentFixture<HistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, HistoryComponent],
      providers: [
        { provide: ElectronService, useValue: electronStub },
        { provide: ToastService, useValue: toastStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ─── formatDuration ───────────────────────────────────────────────────────

  describe('formatDuration()', () => {
    it('returns "N/A" for undefined', () => {
      expect(component.formatDuration(undefined)).toBe('N/A');
    });

    it('returns "N/A" for 0', () => {
      expect(component.formatDuration(0)).toBe('N/A');
    });

    it('formats seconds correctly', () => {
      expect(component.formatDuration(90)).toBe('1:30');
    });

    it('zero-pads seconds below 10', () => {
      expect(component.formatDuration(65)).toBe('1:05');
    });
  });

  // ─── formatTime ───────────────────────────────────────────────────────────

  describe('formatTime()', () => {
    it('returns "N/A" for undefined', () => {
      expect(component.formatTime(undefined)).toBe('N/A');
    });

    it('shows milliseconds for sub-second durations', () => {
      expect(component.formatTime(500)).toBe('500ms');
    });

    it('shows seconds for durations over 1000ms', () => {
      expect(component.formatTime(2500)).toBe('2.5s');
    });
  });

  // ─── getStatusVariant ─────────────────────────────────────────────────────

  describe('getStatusVariant()', () => {
    it('maps "completed" to "success"', () => {
      expect(component.getStatusVariant('completed')).toBe('success');
    });

    it('maps "failed" to "error"', () => {
      expect(component.getStatusVariant('failed')).toBe('error');
    });

    it('maps "processing" to "primary"', () => {
      expect(component.getStatusVariant('processing')).toBe('primary');
    });

    it('maps unknown status to empty string', () => {
      expect(component.getStatusVariant('unknown')).toBe('');
    });
  });

  // ─── loadHistory error path ───────────────────────────────────────────────

  it('sets history to [] and clears loading state when electron throws', async () => {
    (electronStub.getTranscriptionHistory as jest.Mock).mockRejectedValue(new Error('IPC error'));

    await component.loadHistory();

    expect(component.history).toEqual([]);
    expect(component.isLoading).toBe(false);
  });

  // ─── copyTranscript ───────────────────────────────────────────────────────

  describe('copyTranscript()', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
      });
    });

    it('does nothing when the item has no result', async () => {
      await component.copyTranscript({ id: '1', status: 'completed', startedAt: '' });
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('blocks unfinished results and explains waiting versus unavailable copies', async () => {
      const pending = { id: 'p', status: 'processing', startedAt: '', result: 'partial' };
      const failed = { id: 'f', status: 'failed', startedAt: '', result: 'partial' };
      expect(component.copyUnavailableReason(pending)).toContain('when transcription finishes');
      expect(component.copyUnavailableReason(failed)).toContain('No transcript');
      expect(component.copyUnavailableReason({ id: 'm', status: 'completed', startedAt: '' })).toContain('No transcript');
      await component.copyTranscript(pending);
      await component.copyTranscript(failed);
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('copies a string result directly and shows success toast', async () => {
      await component.copyTranscript({ id: '1', status: 'completed', startedAt: '', result: 'plain text' });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('plain text');
      expect(toastStub.show).toHaveBeenCalledWith('Transcript copied to clipboard', 'success');
    });

    it('copies the text property from an object result', async () => {
      await component.copyTranscript({ id: '1', status: 'completed', startedAt: '', result: { text: 'object text' } });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('object text');
    });

    it('shows error toast when clipboard write fails', async () => {
      (navigator.clipboard.writeText as jest.Mock).mockRejectedValue(new Error('denied'));
      await component.copyTranscript({ id: '1', status: 'completed', startedAt: '', result: 'text' });
      expect(toastStub.show).toHaveBeenCalledWith('Failed to copy transcript', 'error');
    });
  });

  // ─── auto-refresh callbacks registered in ngOnInit ───────────────────────
  //
  // HistoryComponent registers onTranscriptionCompleted and onTranscriptionError
  // listeners to auto-refresh the list. We capture those callbacks by setting
  // up mockImplementation before the component is created.

  describe('auto-refresh callbacks registered in ngOnInit', () => {
    let completedCallback: () => void;
    let errorCallback: () => void;

    beforeEach(async () => {
      (electronStub.onTranscriptionCompleted as jest.Mock).mockImplementation((cb: any) => {
        completedCallback = cb;
      });
      (electronStub.onTranscriptionError as jest.Mock).mockImplementation((cb: any) => {
        errorCallback = cb;
      });

      fixture = TestBed.createComponent(HistoryComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('refreshes history when a transcription completes', async () => {
      const newHistory = [{ id: '1', status: 'completed', startedAt: '' }];
      (electronStub.getTranscriptionHistory as jest.Mock).mockResolvedValue(newHistory);

      completedCallback();
      await fixture.whenStable();

      expect(component.history).toEqual(newHistory);
    });

    it('refreshes history when a transcription fails', async () => {
      const newHistory = [{ id: '1', status: 'failed', startedAt: '' }];
      (electronStub.getTranscriptionHistory as jest.Mock).mockResolvedValue(newHistory);

      errorCallback();
      await fixture.whenStable();

      expect(component.history).toEqual(newHistory);
    });
  });
});
