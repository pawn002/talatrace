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
    electronStub.getAvailableModels.mockResolvedValue([
      { name: 'tiny', size: '75 MiB', sizeBytes: 77691713, speed: '4.4× real time', accuracy: '4.9% errors', installed: false },
      { name: 'base', size: '142 MiB', sizeBytes: 147951465, speed: '3.4× real time', accuracy: '3.8% errors', installed: false },
    ]);

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

  // ─── loadModels ───────────────────────────────────────────────────────────

  describe('loadModels()', () => {
    it('shows named numeric reference badges with neutral styling and visible benchmark context', async () => {
      electronStub.getAvailableModels.mockResolvedValue([{ name: 'base', size: '142 MiB', installed: true, speed: '3.4× real time', accuracy: '3.8% errors' }]);
      await component.loadModels(); fixture.detectChanges();
      expect([...fixture.nativeElement.querySelectorAll('tbody .badge')].map((badge: any) => badge.textContent.trim())).toEqual(['3.4× real time', '3.8% errors']);
      expect(fixture.nativeElement.querySelectorAll('tbody .badge--default')).toHaveLength(2);
      expect(fixture.nativeElement.querySelector('table').getAttribute('aria-describedby')).toBe('model-benchmark-context');
      expect(fixture.nativeElement.querySelector('#model-benchmark-context').textContent).toContain('Intel i7-1260P');
    });

    it('does not invent a performance grade when reference measurements are missing', async () => {
      electronStub.getAvailableModels.mockResolvedValue([{ name: 'large', installed: false }]);
      await component.loadModels(); fixture.detectChanges();
      expect(component.models[0].speed).toBe('Not measured');
      expect(component.models[0].accuracy).toBe('Not measured');
      expect(fixture.nativeElement.textContent).not.toContain('Evaluate');
    });
    it('uses catalog metadata and explains a missing runtime beside its disabled download', async () => {
      electronStub.getAvailableModels.mockResolvedValue([{ name: 'parakeet-tdt-0.6b-v3', displayName: 'Parakeet', repository: 'handy-computer/parakeet-tdt-0.6b-v3-gguf', repositoryUrl: 'https://huggingface.co/handy-computer/parakeet-tdt-0.6b-v3-gguf', description: 'Long explanatory model description.', size: '706 MiB', sizeBytes: 739508576, installed: false, available: false, unavailableReason: 'Runtime is not included.' }]);
      await component.loadModels();
      fixture.detectChanges();
      expect(component.models).toHaveLength(1);
      expect(component.models[0].size).toBe('706 MiB');
      expect(fixture.nativeElement.textContent).toContain('Runtime is not included.');
      expect(fixture.nativeElement.querySelector('tbody button').disabled).toBe(true);
      expect(fixture.nativeElement.querySelector('.model-repository a').getAttribute('href')).toBe('https://huggingface.co/handy-computer/parakeet-tdt-0.6b-v3-gguf');
      expect(fixture.nativeElement.textContent).not.toContain('Long explanatory model description.');
      await component.downloadModel(component.models[0]);
      expect(electronStub.downloadModel).not.toHaveBeenCalled();
    });
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
