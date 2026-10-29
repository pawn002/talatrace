import { readThemePreference, saveThemePreference } from './theme';
import { Component, OnInit, ViewChild, ElementRef } from "@angular/core";
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
  @ViewChild('overwriteModal', { static: true }) overwriteModal!: ElementRef<HTMLElement & { updateComplete: Promise<unknown> }>;
  notificationPreferencesOpen = false;

  openNotificationPreferences(): void { this.toastService.pauseAll('preferences'); this.notificationPreferencesOpen = true; }
  closeNotificationPreferences(): void { this.notificationPreferencesOpen = false; this.toastService.resumeAll('preferences'); }
  onNotificationTimeout(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!['0', '5', '10', '30'].includes(select.value)) { select.value = String(this.toastService.timeoutSeconds); return; }
    this.toastService.setTimeoutSeconds(Number(select.value));
  }
  onToastFocusOut(id: string, event: FocusEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) this.toastService.resume(id, 'focus');
  }

  private async describeOverwrite(): Promise<void> {
    const modal = this.overwriteModal.nativeElement;
    await modal.updateComplete;
    const dialog = modal.shadowRoot?.querySelector('dialog');
    if (!dialog) return;
    // Candor 6 has no description slot/property. Keep the IDREF in the same
    // shadow root as its native dialog; a light-DOM ID cannot cross that boundary.
    let description = dialog.querySelector<HTMLElement>('#overwrite-description');
    if (!description) { description = document.createElement('span'); description.id = 'overwrite-description'; description.hidden = true; dialog.append(description); }
    description.textContent = 'The following file already exists. Replacing it will overwrite its contents. ' + (this.overwriteRequest?.filePath || '');
    dialog.setAttribute('aria-describedby', description.id);
  }

  finishOverwrite(replace = false): void {
    const request = this.overwriteRequest;
    this.overwriteRequest = undefined;
    request?.respond(replace);
  }

  onOverwriteKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const modal = event.currentTarget as HTMLElement;
    const first = modal.shadowRoot?.querySelector<HTMLButtonElement>('dialog button');
    const buttons = modal.querySelectorAll<HTMLButtonElement>('[slot=footer] button');
    const last = buttons[buttons.length - 1];
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
    this.electronService.overwriteRequested.subscribe(request => { this.overwriteRequest = request; void this.describeOverwrite(); });
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
