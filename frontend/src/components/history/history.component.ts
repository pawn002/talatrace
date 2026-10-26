import { TableScrollDirective } from '../../directives/table-scroll.directive';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, OnDestroy } from "@angular/core";

import { ElectronService } from "../../services/electron.service";
import { ToastService } from "../../services/toast.service";

interface TranscriptionHistoryItem {
  id: string;
  status: string;
  fileName?: string;
  startedAt: string;
  completedAt?: string;
  audioDuration?: number;
  transcriptionTime?: number;
  result?: any;
  error?: string;
  options?: any;
}

type SortKey = 'file' | 'model' | 'status' | 'duration' | 'time' | 'date';
type SortDirection = 'ascending' | 'descending';

@Component({
  selector: "app-history",
  standalone: true,
  imports: [TableScrollDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: "./history.component.html",
  styleUrls: ["./history.component.scss"],
})
export class HistoryComponent implements OnInit, OnDestroy {
  history: TranscriptionHistoryItem[] = [];
  isLoading = true;
  isRefreshing = false;
  sortKey: SortKey | null = null;
  sortDirection: SortDirection = 'ascending';
  sortAnnouncement = '';
  readonly columns: ReadonlyArray<{ key: SortKey; label: string; numeric?: boolean; mono?: boolean }> = [
    { key: 'file', label: 'File' }, { key: 'model', label: 'Model' }, { key: 'status', label: 'Status' },
    { key: 'duration', label: 'Audio duration', numeric: true },
    { key: 'time', label: 'Processing time', numeric: true }, { key: 'date', label: 'Date', mono: true },
  ];
  private readonly collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

  get sortedHistory(): TranscriptionHistoryItem[] {
    if (!this.sortKey) return this.history;
    const key = this.sortKey;
    const direction = this.sortDirection === 'ascending' ? 1 : -1;
    return [...this.history].sort((a, b) => {
      const left = this.sortValue(a, key), right = this.sortValue(b, key);
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      return direction * (typeof left === 'number' && typeof right === 'number'
        ? left - right : this.collator.compare(String(left), String(right)));
    });
  }

  private sortValue(item: TranscriptionHistoryItem, key: SortKey): string | number | null {
    if (key === 'file') return item.fileName || null;
    if (key === 'model') return item.options?.model || 'base';
    if (key === 'status') return item.status || null;
    const value = key === 'date' ? Date.parse(item.startedAt) : key === 'duration' ? item.audioDuration : item.transcriptionTime;
    return typeof value === 'number' && Number.isFinite(value) && (key === 'date' || value >= 0) ? value : null;
  }

  nextSortDirection(key: SortKey): SortDirection {
    return this.sortKey === key ? (this.sortDirection === 'ascending' ? 'descending' : 'ascending')
      : key === 'date' ? 'descending' : 'ascending';
  }

  sortBy(key: SortKey): void {
    this.sortDirection = this.nextSortDirection(key);
    this.sortKey = key;
    this.sortAnnouncement = `Sorted by ${this.columns.find(column => column.key === key)!.label}, ${this.sortDirection}. Missing values are last.`;
  }

  constructor(
    private electronService: ElectronService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadHistory();

    // Listen for transcription completion events to auto-refresh
    this.electronService.onTranscriptionCompleted(() => {
      console.log("Transcription completed, refreshing history...");
      this.loadHistory();
    });

    this.electronService.onTranscriptionError(() => {
      console.log("Transcription failed, refreshing history...");
      this.loadHistory();
    });
  }

  ngOnDestroy(): void {
    // Clean up event listeners
    this.electronService.removeAllListeners("transcription-completed");
    this.electronService.removeAllListeners("transcription-error");
  }

  async loadHistory(): Promise<void> {
    if (this.isRefreshing) return;
    this.isLoading = this.history.length === 0;
    this.isRefreshing = true;
    try {
      console.log("Loading transcription history...");
      const result = await this.electronService.getTranscriptionHistory();
      console.log("History received:", result);
      this.history = result;
    } catch (error) {
      console.error("Failed to load history:", error);
      this.history = [];
    } finally {
      this.isLoading = false;
      this.isRefreshing = false;
    }
  }

  copyUnavailableReason(item: TranscriptionHistoryItem): string {
    if (item.status === 'completed' && item.result) return '';
    if (item.status === 'pending' || item.status === 'processing') return 'Copy becomes available when transcription finishes.';
    return 'No transcript is available to copy.';
  }

  formatDuration(seconds?: number): string {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  formatTime(ms?: number): string {
    if (!ms) return "N/A";
    if (ms < 1000) return `${ms}ms`;
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  }

  formatTimestamp(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  getStatusVariant(status: string): string {
    switch (status) {
      case "completed":
        return "success";
      case "failed":
        return "error";
      case "processing":
        return "primary";
      default:
        return "";
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return 'check-circle';
      case 'failed': return 'x-circle';
      case 'pending': return 'hourglass';
      case 'processing': return 'waveform';
      case 'cancelled': return 'prohibit';
      default: return 'info';
    }
  }

  async copyTranscript(item: TranscriptionHistoryItem): Promise<void> {
    if (this.copyUnavailableReason(item)) return;
    if (item.result) {
      try {
        const text =
          typeof item.result === "string" ? item.result : item.result.text;
        await navigator.clipboard.writeText(text);
        this.toastService.show("Transcript copied to clipboard", "success");
      } catch (error) {
        this.toastService.show("Failed to copy transcript", "error");
      }
    }
  }
}
