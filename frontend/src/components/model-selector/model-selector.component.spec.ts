import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ModelSelectorComponent } from './model-selector.component';
import { ElectronService } from '../../services/electron.service';
import { ToastService } from '../../services/toast.service';

const electronStub = {
  getAvailableModels: jest.fn().mockResolvedValue([]),
  downloadModel: jest.fn(),
  onModelDownloadProgress: jest.fn(),
};

const toastStub = {
  show: jest.fn(),
};

describe('ModelSelectorComponent', () => {
  let component: ModelSelectorComponent;
  let fixture: ComponentFixture<ModelSelectorComponent>;

  beforeEach(async () => {
    jest.clearAllMocks();
    electronStub.getAvailableModels.mockResolvedValue([]);

    await TestBed.configureTestingModule({
      imports: [CommonModule, ModelSelectorComponent],
      providers: [
        { provide: ElectronService, useValue: electronStub },
        { provide: ToastService, useValue: toastStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModelSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  // ─── getSpeedVariant ──────────────────────────────────────────────────────

  describe('getSpeedVariant()', () => {
    it('maps "Fastest" to "success"', () => {
      expect(component.getSpeedVariant('Fastest')).toBe('success');
    });

    it('maps "Fast" to "success"', () => {
      expect(component.getSpeedVariant('Fast')).toBe('success');
    });

    it('maps "Slow" to "warning"', () => {
      expect(component.getSpeedVariant('Slow')).toBe('warning');
    });

    it('maps "Slowest" to "warning"', () => {
      expect(component.getSpeedVariant('Slowest')).toBe('warning');
    });

    it('maps "Medium" to "default"', () => {
      expect(component.getSpeedVariant('Medium')).toBe('default');
    });
  });

  // ─── getAccuracyVariant ───────────────────────────────────────────────────

  describe('getAccuracyVariant()', () => {
    it('maps "Best" to "success"', () => {
      expect(component.getAccuracyVariant('Best')).toBe('success');
    });

    it('maps "Great" to "success"', () => {
      expect(component.getAccuracyVariant('Great')).toBe('success');
    });

    it('maps "Lower" to "warning"', () => {
      expect(component.getAccuracyVariant('Lower')).toBe('warning');
    });

    it('maps "Good" to "default"', () => {
      expect(component.getAccuracyVariant('Good')).toBe('default');
    });

    it('maps "Better" to "default"', () => {
      expect(component.getAccuracyVariant('Better')).toBe('default');
    });
  });

  // ─── loadModels ───────────────────────────────────────────────────────────

  describe('loadModels()', () => {
    it('marks a model as installed when found in the electron response', async () => {
      electronStub.getAvailableModels.mockResolvedValue([
        { name: 'base', installed: true },
      ]);

      await component.loadModels();

      const base = component.models.find(m => m.name === 'base');
      expect(base?.installed).toBe(true);
    });

    it('shows an error toast when electron throws', async () => {
      electronStub.getAvailableModels.mockRejectedValue(new Error('IPC error'));

      await component.loadModels();

      expect(toastStub.show).toHaveBeenCalledWith('Failed to load models', 'error');
    });
  });

  // ─── downloadModel ────────────────────────────────────────────────────────

  describe('downloadModel()', () => {
    it('returns early without calling electron if already downloading', async () => {
      const model = { ...component.models[0], downloading: true };

      await component.downloadModel(model as any);

      expect(electronStub.downloadModel).not.toHaveBeenCalled();
    });

    it('marks model as installed and shows success toast on successful download', async () => {
      electronStub.downloadModel.mockResolvedValue({ success: true });
      const model = component.models.find(m => m.name === 'tiny')!;

      await component.downloadModel(model);

      expect(model.installed).toBe(true);
      expect(model.downloading).toBe(false);
      expect(toastStub.show).toHaveBeenCalledWith(
        expect.stringContaining('tiny'),
        'success',
      );
    });

    it('resets downloading state and shows error toast on failure', async () => {
      electronStub.downloadModel.mockRejectedValue(new Error('Network error'));
      const model = component.models.find(m => m.name === 'tiny')!;

      await component.downloadModel(model);

      expect(model.downloading).toBe(false);
      expect(toastStub.show).toHaveBeenCalledWith(
        expect.stringContaining('tiny'),
        'error',
      );
    });
  });
});
