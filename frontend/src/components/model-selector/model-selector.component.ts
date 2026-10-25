import { TableScrollDirective } from '../../directives/table-scroll.directive';
import { Component, OnInit } from "@angular/core";

import { ElectronService } from "../../services/electron.service";
import { ToastService } from "../../services/toast.service";

interface WhisperModel {
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
  models: WhisperModel[] = [
    {
      name: "tiny",
      size: "39 MB",
      sizeBytes: 39,
      speed: "Fastest",
      accuracy: "Lower",
      installed: false,
    },
    {
      name: "base",
      size: "74 MB",
      sizeBytes: 74,
      speed: "Fast",
      accuracy: "Good",
      installed: false,
    },
    {
      name: "small",
      size: "244 MB",
      sizeBytes: 244,
      speed: "Medium",
      accuracy: "Better",
      installed: false,
    },
    {
      name: "medium",
      size: "769 MB",
      sizeBytes: 769,
      speed: "Slow",
      accuracy: "Great",
      installed: false,
    },
    {
      name: "large",
      size: "1550 MB",
      sizeBytes: 1550,
      speed: "Slowest",
      accuracy: "Best",
      installed: false,
    },
  ];

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

      // Update installed status
      this.models.forEach((model) => {
        const found = installedModels.find((m: any) => m.name === model.name);
        if (found) {
          model.installed = found.installed || false;
        }
      });
    } catch (error) {
      console.error("Failed to load models:", error);
      this.toastService.show("Failed to load models", "error");
    } finally {
      this.isLoading = false;
    }
  }

  async downloadModel(model: WhisperModel): Promise<void> {
    if (model.downloading) return;

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
