import { readThemePreference, saveThemePreference } from './theme';
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
  title = "TalaTrace";
  systemInfo: any = null;
  activeTab = 0;
  overwriteRequest?: { filePath: string; respond: (replace: boolean) => void };

  finishOverwrite(replace = false): void {
    const request = this.overwriteRequest;
    this.overwriteRequest = undefined;
    request?.respond(replace);
  }

  onOverwriteKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const modal = event.currentTarget as HTMLElement;
    const first = modal.shadowRoot?.querySelector<HTMLButtonElement>('dialog button');
    const last = modal.querySelector<HTMLButtonElement>('[data-action=replace]');
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    else if (event.shiftKey && modal.shadowRoot?.activeElement === first) { event.preventDefault(); last?.focus(); }
  }
  themePreference = readThemePreference();
  readonly themeOptions = [{ value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }, { value: 'system', label: 'System', icon: 'desktop' }];

  onThemeChange(event: Event): void {
    if (!(event.target instanceof HTMLInputElement) || !event.target.checked) return;
    const value = event.target.value;
    if (value !== 'light' && value !== 'dark' && value !== 'system') return;
    this.themePreference = value;
    saveThemePreference(value);
  }

  onThemeKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Home' && event.key !== 'End') return;
    const inputs = document.querySelectorAll<HTMLInputElement>('#theme-control input');
    const next = inputs[event.key === 'Home' ? 0 : inputs.length - 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.click();
  }

  @ViewChild(TranscriptionComponent) transcription?: TranscriptionComponent;

  onAppTabKeydown(event: KeyboardEvent): void {
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
    this.electronService.overwriteRequested.subscribe(request => { this.overwriteRequest = request; });
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
