import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ModelSelectorComponent } from './model-selector.component';
import { ElectronService } from '../../services/electron.service';
import { ToastService } from '../../services/toast.service';

const electronStub = {
  getAvailableModels: jest.fn().mockResolvedValue([]),
  downloadModel: jest.fn(),
  deleteModel: jest.fn(),
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

  it('offers ghost Delete for installed weights and retains the action button after deletion', async () => {
    const installed = { name: 'base', displayName: 'Whisper Base', installed: true };
    electronStub.getAvailableModels.mockResolvedValue([installed]);
    await component.loadModels(); fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('[data-model-action]');
    expect(button.classList.contains('button--ghost')).toBe(true);
    expect(button.textContent).toContain('Delete');
    expect(button.getAttribute('aria-label')).toBe('Delete Whisper Base');
    let finish!: (value: any) => void;
    electronStub.deleteModel.mockImplementationOnce(() => new Promise(resolve => finish = resolve));
    const request = component.deleteModel(component.models[0]);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Deleting Whisper Base from this device.');
    await component.loadModels(); fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(component.deletionNotice).toContain('Deleting Whisper Base');
    electronStub.getAvailableModels.mockResolvedValue([{ ...installed, installed: false }]);
    finish({ success: true }); await request; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-model-action]')).toBe(button);
    expect(button.textContent).toContain('Download');
    expect(button.disabled).toBe(false);
  });

  it('explains blocked deletion and reports failure without claiming the weights were removed', async () => {
    electronStub.getAvailableModels.mockResolvedValue([{ name: 'base', installed: true, deletionBlocked: true }]);
    await component.loadModels(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-model-action]').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Finish transcription');
    await component.deleteModel(component.models[0]);
    expect(electronStub.deleteModel).not.toHaveBeenCalled();
    component.models[0].deletionBlocked = false;
    electronStub.deleteModel.mockRejectedValueOnce(new Error('Disk error'));
    await component.deleteModel(component.models[0]);
    expect(component.models[0].installed).toBe(true);
    expect(toastStub.show).toHaveBeenCalledWith(expect.stringContaining('Disk error'), 'error');
  });

  describe('loadModels()', () => {
    it('shows plain reference values with visible benchmark context', async () => {
      electronStub.getAvailableModels.mockResolvedValue([{ name: 'base', size: '142 MiB', installed: true, speed: '3.4× real time', accuracy: '3.8% errors' }]);
      await component.loadModels(); fixture.detectChanges();
      const cells = fixture.nativeElement.querySelectorAll('tbody td');
      expect(cells[2].textContent.trim()).toBe('3.4× real time');
      expect(cells[3].textContent.trim()).toBe('3.8% errors');
      expect(fixture.nativeElement.querySelector('tbody .badge')).toBeNull();
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

  describe('sorting', () => {
    const model = (name: string, extra = {}) => ({ name, size: '1 MiB', sizeBytes: 1024*1024, speed: '1.0× real time', accuracy: '1.0% errors', installed: false, ...extra });

    it('sorts raw bytes across units without mutating catalog order', () => {
      component.models = [model('gib', { size: '1 GiB', sizeBytes: 1024**3 }), model('mib', { size: '2 MiB', sizeBytes: 2*1024**2 })];
      component.sortBy('size');
      expect(component.sortedModels.map(m => m.name)).toEqual(['mib','gib']);
      component.sortBy('size');
      expect(component.sortedModels.map(m => m.name)).toEqual(['gib','mib']);
      expect(component.models.map(m => m.name)).toEqual(['gib','mib']);
    });

    it('uses unrounded speed and keeps unknowns last in either direction', () => {
      component.models = [model('slower', { speedRatio: 1.03 }), model('unknown'), model('faster', { speedRatio: 1.04 })];
      component.sortBy('speed');
      expect(component.sortDirection).toBe('descending');
      expect(component.sortedModels.map(m => m.name)).toEqual(['faster','slower','unknown']);
      component.sortBy('speed');
      expect(component.sortedModels.map(m => m.name)).toEqual(['slower','faster','unknown']);
    });

    it('supports zero errors, stable ties and missing/invalid measurements', () => {
      component.models = [model('tie-a', { wordErrorRate: .01 }), model('unknown'), model('perfect', { wordErrorRate: 0 }), model('invalid', { wordErrorRate: NaN }), model('tie-b', { wordErrorRate: .01 })];
      component.sortBy('errors');
      expect(component.sortedModels.map(m => m.name)).toEqual(['perfect','tie-a','tie-b','unknown','invalid']);
      component.sortBy('errors');
      expect(component.sortedModels.map(m => m.name)).toEqual(['tie-a','tie-b','perfect','unknown','invalid']);
    });

    it('uses natural display-name order and the currently displayed status', () => {
      component.models = [model('ten', { displayName: 'Model 10', installed: true }), model('two', { displayName: 'Model 2', downloading: true }), model('unavailable', { available: false, installed: true }), model('missing')];
      component.sortBy('name');
      expect(component.sortedModels.map(m => m.name)).toEqual(['missing','two','ten','unavailable']);
      component.sortBy('status');
      expect(component.sortedModels.map(m => m.name)).toEqual(['two','ten','missing','unavailable']);
    });

    it('exposes one active aria-sort, next-action labels and stable header focus', () => {
      fixture.detectChanges();
      const headers = fixture.nativeElement.querySelectorAll('thead .sort-header');
      expect(headers).toHaveLength(5);
      expect(fixture.nativeElement.querySelectorAll('th[aria-sort]')).toHaveLength(0);
      headers[1].focus(); headers[1].click(); fixture.detectChanges();
      expect(document.activeElement).toBe(headers[1]);
      expect(headers[1].closest('th').getAttribute('aria-sort')).toBe('ascending');
      expect(headers[1].getAttribute('aria-label')).toBe('Sort by Size, descending');
      headers[2].click(); fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('th[aria-sort]')).toHaveLength(1);
      expect(headers[2].closest('th').getAttribute('aria-sort')).toBe('descending');
      expect(fixture.nativeElement.querySelector('.sort-status').textContent).toContain('Reference speed, descending');
      expect(fixture.nativeElement.querySelector('thead th:last-child button')).toBeNull();
    });

    it('retains sort choice when download completion refreshes the catalog', async () => {
      component.sortBy('size');
      fixture.detectChanges();
      const header = fixture.nativeElement.querySelector('[data-sort="size"]');
      header.focus();
      electronStub.getAvailableModels.mockResolvedValue([model('b', { sizeBytes: 20 }), model('a', { sizeBytes: 10 })]);
      const refresh = component.loadModels(); fixture.detectChanges();
      expect(document.activeElement).toBe(header);
      expect(fixture.nativeElement.querySelector('.table-host').getAttribute('aria-busy')).toBe('true');
      await refresh; fixture.detectChanges();
      expect(component.sortKey).toBe('size');
      expect(component.sortedModels.map(m => m.name)).toEqual(['a','b']);
      expect(document.activeElement).toBe(header);
      expect(fixture.nativeElement.querySelector('.table-host').getAttribute('aria-busy')).toBe('false');
    });
  });

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
