import { Component, inject } from '@angular/core';
import { LoaderService } from './loader.service';

/** Thin indeterminate progress bar pinned to the top, shown while requests are in flight. */
@Component({
  selector: 'erp-loader-bar',
  template: `
    @if (loader.loading()) {
      <div class="erp-loader-bar"><div class="erp-loader-bar__indicator"></div></div>
    }
  `,
  styles: [
    `
      .erp-loader-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        z-index: 2000;
        background: transparent;
        overflow: hidden;
      }
      .erp-loader-bar__indicator {
        height: 100%;
        width: 40%;
        background: var(--erp-accent, #2f6fed);
        animation: erp-loader-slide 1.1s ease-in-out infinite;
      }
      @keyframes erp-loader-slide {
        0% { transform: translateX(-100%); }
        50% { transform: translateX(120%); }
        100% { transform: translateX(260%); }
      }
    `,
  ],
})
export class LoaderBarComponent {
  protected readonly loader = inject(LoaderService);
}
