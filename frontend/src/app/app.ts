import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoaderBarComponent } from './core/loader/loader-bar.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoaderBarComponent],
  template: '<erp-loader-bar /><router-outlet />',
})
export class App {}
