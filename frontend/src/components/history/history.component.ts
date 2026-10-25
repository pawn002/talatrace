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
    this.isLoading = true;
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
    }
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

  async copyTranscript(item: TranscriptionHistoryItem): Promise<void> {
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
