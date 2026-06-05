import { inject, Injectable } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

/**
 * Thin wrapper over ngx-toastr so the rest of the app has one notification API.
 * Toasts stack, so multiple messages can be shown at once.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly toastr = inject(ToastrService);

  success(message: string, title?: string): void {
    this.toastr.success(message, title);
  }
  error(message: string, title = 'Error'): void {
    this.toastr.error(message, title);
  }
  info(message: string, title?: string): void {
    this.toastr.info(message, title);
  }
  warning(message: string, title?: string): void {
    this.toastr.warning(message, title);
  }
}
