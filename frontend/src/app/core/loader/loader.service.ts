import { computed, Injectable, signal } from '@angular/core';

/**
 * Tracks the number of in-flight HTTP requests (incremented/decremented by the
 * loader interceptor). `loading` is true whenever any tracked request is pending,
 * driving the global loader bar. Also usable manually via show()/hide().
 */
@Injectable({ providedIn: 'root' })
export class LoaderService {
  private readonly count = signal(0);
  readonly loading = computed(() => this.count() > 0);

  show(): void {
    this.count.update((c) => c + 1);
  }
  hide(): void {
    this.count.update((c) => Math.max(0, c - 1));
  }
}
