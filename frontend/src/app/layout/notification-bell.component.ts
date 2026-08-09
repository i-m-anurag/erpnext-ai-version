import { Component, DestroyRef, HostListener, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { interval } from 'rxjs';
import { NotificationApiService, type AppNotification } from '../core/api/notification.api.service';
import { routeForMaster } from '../core/config/view-configs';
import { formatDateTime } from '../core/util/format';

/**
 * Header notification bell — unread count badge + a dropdown of the in-app feed
 * (Step 4's /api/notifications). Clicking a notice marks it read and opens the
 * related record. The count refreshes on a light poll.
 */
@Component({
  selector: 'erp-notification-bell',
  template: `
    <div class="iq-bell">
      <button class="btn btn-sm btn-icon" title="Notifications" (click)="toggle()">
        <i class="ph ph-bell"></i>
        @if (unread() > 0) {
          <span class="iq-bell__badge">{{ unread() > 99 ? '99+' : unread() }}</span>
        }
      </button>
      @if (open()) {
        <div class="iq-bell__menu">
          <div class="iq-bell__head">
            <span>Notifications</span>
            @if (unread() > 0) {
              <button class="iq-bell__link" (click)="markAll()">Mark all read</button>
            }
          </div>
          @if (items().length === 0) {
            <div class="iq-bell__empty"><i class="ph ph-check-circle"></i> You're all caught up.</div>
          } @else {
            <div class="iq-bell__list">
              @for (n of items(); track n.id) {
                <button class="iq-bell__item" [class.unread]="!n.read" (click)="click(n)">
                  <div class="iq-bell__title">{{ n.title }}</div>
                  @if (n.body) { <div class="iq-bell__body">{{ n.body }}</div> }
                  <div class="iq-bell__time">{{ fmt(n.createdAt) }}</div>
                </button>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .iq-bell { position: relative; }
    .iq-bell__badge {
      position: absolute; top: -3px; right: -3px; min-width: 16px; height: 16px; padding: 0 4px;
      border-radius: 999px; background: #ef4444; color: #fff; font-size: 10px; line-height: 16px;
      font-weight: 600; text-align: center;
    }
    .iq-bell__menu {
      position: absolute; right: 0; top: calc(100% + 8px); width: 340px; max-height: 440px;
      display: flex; flex-direction: column; background: var(--erp-surface, #fff);
      border: 1px solid var(--erp-border, #eaeaea); border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,.12); z-index: 1000; overflow: hidden;
    }
    .iq-bell__head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px;
      border-bottom: 1px solid var(--erp-border, #eaeaea); font-weight: 600; font-size: .85rem; }
    .iq-bell__link { border: 0; background: none; color: var(--erp-accent, #5f79eb); font-size: .78rem; cursor: pointer; padding: 0; }
    .iq-bell__empty { padding: 24px 14px; color: var(--erp-text-muted); font-size: .82rem; text-align: center; }
    .iq-bell__list { overflow-y: auto; }
    .iq-bell__item { display: block; width: 100%; text-align: left; border: 0; background: none; cursor: pointer;
      padding: 10px 14px; border-bottom: 1px solid var(--erp-border, #f0f0f0); }
    .iq-bell__item:hover { background: #fafafb; }
    .iq-bell__item.unread { background: var(--erp-accent-soft, #eef1fe); }
    .iq-bell__item.unread:hover { background: #e6ebfe; }
    .iq-bell__title { font-size: .82rem; font-weight: 600; color: #17171a; }
    .iq-bell__body { font-size: .78rem; color: var(--erp-text-muted); margin-top: 2px; }
    .iq-bell__time { font-size: .7rem; color: var(--erp-text-muted); margin-top: 3px; }
  `],
})
export class NotificationBellComponent {
  private readonly api = inject(NotificationApiService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly open = signal(false);
  protected readonly unread = signal(0);
  protected readonly items = signal<AppNotification[]>([]);

  constructor() {
    this.refreshCount();
    // Light poll so a notice raised elsewhere shows up without a reload.
    interval(30_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshCount());
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) this.api.mine().subscribe((n) => this.items.set(n));
  }

  /** Close the dropdown when clicking outside it. */
  @HostListener('document:click', ['$event'])
  protected onDocClick(e: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }

  protected click(n: AppNotification): void {
    if (!n.read) {
      this.api.markRead(n.id).subscribe(() => {
        this.items.update((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        this.refreshCount();
      });
    }
    this.open.set(false);
    const route = n.entityType ? routeForMaster(n.entityType) : undefined;
    if (route && n.recordId) void this.router.navigate(['/app/m', route[0], route[1], n.recordId]);
  }

  protected markAll(): void {
    this.api.markAllRead().subscribe(() => {
      this.items.update((list) => list.map((x) => ({ ...x, read: true })));
      this.unread.set(0);
    });
  }

  protected fmt(iso: string): string {
    return formatDateTime(iso);
  }
  private refreshCount(): void {
    this.api.unreadCount().subscribe((c) => this.unread.set(c));
  }
}
