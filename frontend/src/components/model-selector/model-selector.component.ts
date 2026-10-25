import { TableScrollDirective } from '../../directives/table-scroll.directive';
import { Component, OnInit } from "@angular/core";

import { ElectronService } from "../../services/electron.service";
import { ToastService } from "../../services/toast.service";

interface WhisperModel {
  displayName?: string;
  description?: string;
  available?: boolean;
  unavailableReason?: string;
  name: string;
  size: string;
  sizeBytes: number;
  speed: string;
  accuracy: string;
  installed: boolean;
  downloading?: boolean;
  downloadProgress?: number;
}

@Component({
  selector: "app-model-selector",
  standalone: true,
  imports: [TableScrollDirective],
  templateUrl: "./model-selector.component.html",
  styleUrls: ["./model-selector.component.scss"],
})
export class ModelSelectorComponent implements OnInit {
  models: WhisperModel[] = [];

  isLoading = true;

  constructor(
    private electronService: ElectronService,
    private toastService: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadModels();
  }

  async loadModels(): Promise<void> {
    this.isLoading = true;
    try {
      const installedModels = await this.electronService.getAvailableModels();

      this.models = installedModels.map((model: any) => ({ ...model,
        speed: model.speed || 'Evaluate', accuracy: model.accuracy || 'Evaluate',
        installed: !!model.installed,
      }));
    } catch (error) {
      console.error("Failed to load models:", error);
      this.toastService.show("Failed to load models", "error");
    } finally {
      this.isLoading = false;
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

  getSpeedVariant(speed: string): string {
    switch (speed) {
      case "Fastest":
      case "Fast":
        return "success";
      case "Slow":
      case "Slowest":
        return "warning";
      default:
        return "default";
    }
  }

  getAccuracyVariant(accuracy: string): string {
    switch (accuracy) {
      case "Best":
      case "Great":
        return "success";
      case "Lower":
        return "warning";
      default:
        return "default";
    }
  }
}
