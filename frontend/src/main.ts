import '@candor-design/web-components/disclosure';
import '@candor-design/web-components/accordion-item';
import '@candor-design/web-components/card';
import '@candor-design/web-components/tooltip';
import '@candor-design/web-components/toast';
import { provideZoneChangeDetection } from "@angular/core";
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app.module';

platformBrowserDynamic().bootstrapModule(AppModule, { applicationProviders: [provideZoneChangeDetection()], })
  .catch(err => console.error(err));
