import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

/**
 * Generic lineage edge between two document records (master rows), e.g.
 * (requisition, REQ-001) → (purchase-order, PO-0042) with relation
 * "po_from_requisition". A graph of these gives full traceability across any
 * document chain (Requisition → PO → PI → Payment …).
 */
@Entity('document_links')
@Index('idx_doclink_from', ['fromMaster', 'fromCode'])
@Index('idx_doclink_to', ['toMaster', 'toCode'])
export class DocumentLink extends BaseEntity {
  @Column({ name: 'from_master', type: 'varchar', length: 64 })
  fromMaster!: string;

  @Column({ name: 'from_code', type: 'varchar', length: 128 })
  fromCode!: string;

  @Column({ name: 'to_master', type: 'varchar', length: 64 })
  toMaster!: string;

  @Column({ name: 'to_code', type: 'varchar', length: 128 })
  toCode!: string;

  @Column({ type: 'varchar', length: 64 })
  relation!: string;
}
