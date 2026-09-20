import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppToolbarComponent } from './shared/app-toolbar.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppToolbarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {}
