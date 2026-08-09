import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

/**
 * An in-app notification for a single user — the feed behind the bell. Written by
 * NotificationService for the `in_app` channel (assignment, state change, …).
 */
@Entity('notifications')
@Index('idx_notifications_user', ['userId', 'read'])
export class Notification extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'body', type: 'varchar', length: 500, nullable: true })
  body!: string | null;

  /** In-app route to open when clicked (e.g. /app/m/procurement/purchase-orders/PO-1). */
  @Column({ name: 'link', type: 'varchar', length: 255, nullable: true })
  link!: string | null;

  @Column({ name: 'read', type: 'boolean', default: false })
  read!: boolean;

  @Column({ name: 'entity_type', type: 'varchar', length: 64, nullable: true })
  entityType!: string | null;

  @Column({ name: 'record_id', type: 'varchar', length: 128, nullable: true })
  recordId!: string | null;
}
