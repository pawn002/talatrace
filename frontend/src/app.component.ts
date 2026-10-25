import { Component, OnInit, ViewChild } from "@angular/core";
import { TranscriptionComponent } from "./components/transcription/transcription.component";
import { ElectronService } from "./services/electron.service";
import { ToastService } from "./services/toast.service";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
  standalone: false,
})
export class AppComponent implements OnInit {
  title = "Whisper Transcription";
  systemInfo: any = null;
  activeTab = 0;
  @ViewChild(TranscriptionComponent) transcription?: TranscriptionComponent;

  onAppTabKeydown(event: KeyboardEvent): void {
    if (this.transcription?.busy) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    this.activeTab = event.key === 'Home' ? 0 : event.key === 'End' ? 2
      : (this.activeTab + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    document.getElementById(['app-tab-transcription', 'app-tab-models', 'app-tab-history'][this.activeTab])?.focus();
  }

  constructor(
    private electronService: ElectronService,
    public toastService: ToastService,
  ) {}

  async ngOnInit() {
    try {
      this.systemInfo = await this.electronService.getSystemInfo();
      console.log("System Info:", this.systemInfo);
    } catch (error) {
      console.error("Failed to get system info:", error);
    }

    this.electronService.onMenuAction("open-file", () => {
      this.openFile();
    });

    this.electronService.onMenuAction("save-transcript", () => {
      this.saveTranscript();
    });
  }

  async openFile() {
    const filePath = await this.electronService.selectAudioFile();
    if (filePath) {
      this.toastService.show(`Selected file: ${filePath}`, "info");
    }
  }

  async saveTranscript() {
    this.toastService.show("Save transcript functionality", "info");
  }
}
