import { BaseRepository } from '../../shared/base.repository.js';
import { logger } from '../../config/logger.js';
import { Notification } from './notification.entity.js';
import { NotificationLog } from './notification-log.entity.js';

/** A resolved target — a user (in-app) and/or an email address (email channel). */
export interface NotifyRecipient {
  userId?: string;
  email?: string;
}

export interface NotifyInput {
  channel: 'email' | 'in_app';
  recipients: NotifyRecipient[];
  /** Email subject / in-app title. */
  title: string;
  body?: string;
  /** Email template slug (email channel). */
  template?: string;
  /** In-app deep link (in_app channel). */
  link?: string;
  vars?: Record<string, string | number>;
  /** Ties the notice to a record and gives it a de-dupe purpose. */
  context?: { entityType?: string; recordId?: string; purpose?: string };
}

/**
 * The single front door for outbound notifications — a channel abstraction over
 * the (existing) email pipeline and the (new) in-app feed. Every send is recorded
 * in `notification_log` (audit) and de-duplicated by a stable key so a retried
 * transition never notifies twice.
 *
 * Channels:
 *  - `in_app`  → writes a `notifications` row (the bell feed). Fully live.
 *  - `email`   → logged only in this phase; actual dispatch is a TODO below.
 *
 * `sms` / `webhook` slot in here later without touching callers.
 */
export class NotificationService {
  private readonly notifications = new BaseRepository(Notification);
  private readonly log = new BaseRepository(NotificationLog);

  async notify(input: NotifyInput): Promise<void> {
    for (const r of input.recipients) {
      const recipient = input.channel === 'email' ? r.email : r.userId;
      if (!recipient) continue;

      const dedupeKey = this.dedupeKey(input, recipient);
      if (dedupeKey && (await this.log.exists({ dedupeKey }))) continue; // idempotent: already notified

      if (input.channel === 'in_app') {
        await this.notifications.save(
          this.notifications.create({
            userId: recipient,
            title: input.title,
            body: input.body ?? null,
            link: input.link ?? null,
            entityType: input.context?.entityType ?? null,
            recordId: input.context?.recordId ?? null,
          }),
        );
        await this.record(input, recipient, dedupeKey, 'sent');
      } else {
        // email channel
        // TODO(comms): dispatch the email here (deferred in this phase). This is where
        // we will enqueueEmail({ slug: input.template, to: recipient, vars: input.vars })
        // / emailService.send(...). For now we only record the intent in the audit log.
        await this.record(input, recipient, dedupeKey, 'queued');
        logger.info({ to: recipient, template: input.template }, 'notify: email logged (dispatch deferred)');
      }
    }
  }

  /** Stable idempotency key: same channel+recipient+purpose+record → notified once. */
  private dedupeKey(input: NotifyInput, recipient: string): string | null {
    const c = input.context;
    if (!c?.purpose) return null; // no purpose = not de-duplicated (always send)
    return [input.channel, recipient, input.template ?? input.title, c.entityType ?? '', c.recordId ?? '', c.purpose].join('|');
  }

  private async record(
    input: NotifyInput,
    recipient: string,
    dedupeKey: string | null,
    status: 'queued' | 'sent' | 'failed' | 'skipped',
  ): Promise<void> {
    await this.log.save(
      this.log.create({
        channel: input.channel,
        template: input.template ?? null,
        recipient,
        subject: input.title,
        status,
        entityType: input.context?.entityType ?? null,
        recordId: input.context?.recordId ?? null,
        purpose: input.context?.purpose ?? null,
        dedupeKey,
        sentAt: status === 'sent' ? new Date() : null,
      }),
    );
  }

  // ---- in-app feed queries (the bell) ---------------------------------------

  async forUser(userId: string, opts: { unreadOnly?: boolean } = {}): Promise<Notification[]> {
    const where = opts.unreadOnly ? { userId, read: false } : { userId };
    return this.notifications.find({ where, order: { createdAt: 'DESC' }, take: 100 });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notifications.count({ userId, read: false });
  }

  async markRead(id: string, userId: string): Promise<void> {
    const n = await this.notifications.findOne({ id, userId });
    if (n && !n.read) {
      n.read = true;
      await this.notifications.save(n);
    }
  }

  async markAllRead(userId: string): Promise<number> {
    const unread = await this.notifications.find({ where: { userId, read: false } });
    for (const n of unread) {
      n.read = true;
      await this.notifications.save(n);
    }
    return unread.length;
  }
}

export const notificationService = new NotificationService();
