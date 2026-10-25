import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from "@angular/core";
import { BrowserModule } from "@angular/platform-browser";
import { HttpClientModule } from "@angular/common/http";
import { FormsModule } from "@angular/forms";

import { AppComponent } from "./app.component";
import { TranscriptionComponent } from "./components/transcription/transcription.component";
import { HistoryComponent } from "./components/history/history.component";
import { ModelSelectorComponent } from "./components/model-selector/model-selector.component";

import { ElectronService } from "./services/electron.service";

@NgModule({
  declarations: [AppComponent, TranscriptionComponent],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    // Standalone components
    HistoryComponent,
    ModelSelectorComponent,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [ElectronService],
  bootstrap: [AppComponent],
})
export class AppModule {}
