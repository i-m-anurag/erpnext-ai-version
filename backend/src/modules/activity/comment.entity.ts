import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

/** A user comment / query thread on a record, keyed by (entityType, recordId). */
@Entity('comments')
@Index('idx_comments_record', ['entityType', 'recordId'])
export class Comment extends BaseEntity {
  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType!: string;

  @Column({ name: 'record_id', type: 'varchar', length: 128 })
  recordId!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'author_user_id', type: 'uuid' })
  authorUserId!: string;
}
