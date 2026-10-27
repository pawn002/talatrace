import { TableScrollDirective } from '../../directives/table-scroll.directive';
import { Component, OnInit, OnDestroy } from "@angular/core";
import { Subscription } from 'rxjs';

import { ElectronService } from "../../services/electron.service";
import { ToastService } from "../../services/toast.service";

interface WhisperModel {
  displayName?: string;
  description?: string;
  repository?: string;
  repositoryUrl?: string;
  available?: boolean;
  unavailableReason?: string;
  name: string;
  size: string;
  sizeBytes: number;
  speed: string;
  accuracy: string;
  speedRatio?: number;
  wordErrorRate?: number;
  installed: boolean;
  downloading?: boolean;
  downloadProgress?: number;
  deleting?: boolean;
  deletionBlocked?: boolean;
}

type SortKey = 'name' | 'size' | 'speed' | 'errors' | 'status';
type SortDirection = 'ascending' | 'descending';

@Component({
  selector: "app-model-selector",
  standalone: true,
  imports: [TableScrollDirective],
  templateUrl: "./model-selector.component.html",
  styleUrls: ["./model-selector.component.scss"],
})
export class ModelSelectorComponent implements OnInit, OnDestroy {
  models: WhisperModel[] = [];
  private pendingDeletes = new Set<string>();
  private modelChanges?: Subscription;
  get deletionInProgress(): boolean { return this.pendingDeletes.size > 0; }
  sortKey: SortKey | null = null;
  sortDirection: SortDirection = 'ascending';
  sortAnnouncement = '';
  readonly columns: ReadonlyArray<{ key: SortKey; label: string; numeric?: boolean }> = [
    { key: 'name', label: 'Model' },
    { key: 'size', label: 'Size', numeric: true },
    { key: 'speed', label: 'Reference speed', numeric: true },
    { key: 'errors', label: 'Word error rate', numeric: true },
    { key: 'status', label: 'Status' },
  ];
  private readonly collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

  get sortedModels(): WhisperModel[] {
    if (!this.sortKey) return this.models;
    const key = this.sortKey;
    const direction = this.sortDirection === 'ascending' ? 1 : -1;
    return [...this.models].sort((a, b) => {
      const left = this.sortValue(a, key), right = this.sortValue(b, key);
      // Unknowns stay last regardless of direction. Native stable sort retains catalog ties.
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      return direction * (typeof left === 'number' && typeof right === 'number'
        ? left - right : this.collator.compare(String(left), String(right)));
    });
  }

  private sortValue(model: WhisperModel, key: SortKey): string | number | null {
    if (key === 'name') return model.displayName || model.name;
    if (key === 'status') return model.available === false ? 'Unavailable' : model.downloading ? 'Downloading' : model.installed ? 'Installed' : 'Not installed';
    const value = key === 'size' ? model.sizeBytes : key === 'speed' ? model.speedRatio : model.wordErrorRate;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  }

  nextSortDirection(key: SortKey): SortDirection {
    return this.sortKey === key ? (this.sortDirection === 'ascending' ? 'descending' : 'ascending')
      : key === 'speed' ? 'descending' : 'ascending';
  }

  sortBy(key: SortKey): void {
    this.sortDirection = this.nextSortDirection(key);
    this.sortKey = key;
    const label = this.columns.find(column => column.key === key)!.label;
    this.sortAnnouncement = `Sorted by ${label}, ${this.sortDirection}. Unmeasured values are last.`;
  }

  isLoading = true;
  isRefreshing = false;

  get deletionNotice(): string {
    const deleting = this.models.find(model => model.deleting);
    if (deleting) return `Deleting ${deleting.displayName || deleting.name} from this device.`;
    return this.models.some(model => model.installed && model.deletionBlocked) ? 'Finish transcription before deleting models.' : '';
  }

  constructor(
    private electronService: ElectronService,
    private toastService: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.modelChanges = this.electronService.modelsChanged?.subscribe(() => this.loadModels());
    await this.loadModels();
  }

  ngOnDestroy(): void { this.modelChanges?.unsubscribe(); }

  async loadModels(): Promise<void> {
    this.isLoading = this.models.length === 0;
    this.isRefreshing = true;
    try {
      const installedModels = await this.electronService.getAvailableModels();

      this.models = installedModels.map((model: any) => ({ ...model,
        deleting: this.pendingDeletes.has(model.name),
        speed: model.speed || 'Not measured', accuracy: model.accuracy || 'Not measured',
        installed: !!model.installed,
      }));
    } catch (error) {
      console.error("Failed to load models:", error);
      this.toastService.show("Failed to load models", "error");
    } finally {
      this.isLoading = false;
      this.isRefreshing = false;
    }
  }

  async downloadModel(model: WhisperModel): Promise<void> {
    if (model.downloading || model.available === false) return;

    model.downloading = true;
    model.downloadProgress = 0;

    try {
      this.toastService.show(`Downloading ${model.name} model...`, "info");

      const result = await this.electronService.downloadModel(model.name);

      if (result.success) {
        model.installed = true;
        model.downloading = false;
        model.downloadProgress = 100;
        this.toastService.show(
          `${model.name} model downloaded successfully! You can now use it for transcription.`,
          "success",
        );
        await this.loadModels();
      } else {
        throw new Error(result.message || "Download failed");
      }
    } catch (error: any) {
      console.error("Download failed:", error);
      model.downloading = false;
      model.downloadProgress = 0;
      this.toastService.show(
        `Failed to download ${model.name}: ${error.message}`,
        "error",
      );
    }
  }

  async deleteModel(model: WhisperModel): Promise<void> {
    if (!model.installed || model.downloading || this.deletionInProgress || model.deletionBlocked) return;
    const action = document.activeElement instanceof HTMLButtonElement && document.activeElement.closest('[data-model]')?.getAttribute('data-model') === model.name
      ? document.activeElement : null;
    model.deleting = true;
    this.pendingDeletes.add(model.name);
    try {
      const result = await this.electronService.deleteModel(model.name);
      if (!result.success) throw new Error(result.message || 'Deletion failed');
      model.installed = false;
      this.toastService.show(`${model.displayName || model.name} deleted. You can download it again from Models.`, 'success');
    } catch (error: any) {
      this.toastService.show(`Could not delete ${model.displayName || model.name}: ${error.message}`, 'error');
    } finally {
      model.deleting = false;
      this.pendingDeletes.delete(model.name);
      await this.loadModels();
      requestAnimationFrame(() => {
        if (action?.isConnected && document.activeElement === document.body) action.focus();
      });
    }
  }

}
