import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One row per outbound third-party API call made through the HTTP gateway.
 * Append-only audit trail — every integration request/response (or error) is
 * recorded here regardless of outcome, so operators can trace exactly what the
 * ERP sent to and received from an external service. Secrets in headers are
 * redacted and large bodies are capped before persisting (see http-gateway).
 */
@Entity('api_call_log')
@Index('idx_api_log_provider', ['provider', 'createdAt'])
@Index('idx_api_log_correlation', ['correlationId'])
@Index('idx_api_log_entity', ['entityType', 'entityId'])
export class ApiCallLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** Logical provider, e.g. "collatio". */
  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  /** Named operation within the provider, e.g. "upload" / "validate-and-reconcile". */
  @Column({ type: 'varchar', length: 128 })
  operation!: string;

  @Column({ type: 'varchar', length: 10 })
  method!: string;

  @Column({ type: 'text' })
  url!: string;

  @Column({ name: 'req_content_type', type: 'varchar', length: 128, nullable: true })
  reqContentType!: string | null;

  /** Redacted request headers. */
  @Column({ name: 'req_headers', type: 'jsonb', nullable: true })
  reqHeaders!: Record<string, unknown> | null;

  /** Request body (JSON stringified or a summary for multipart), capped in size. */
  @Column({ name: 'req_body', type: 'text', nullable: true })
  reqBody!: string | null;

  @Column({ name: 'resp_status', type: 'int', nullable: true })
  respStatus!: number | null;

  /** Response body, capped in size. */
  @Column({ name: 'resp_body', type: 'text', nullable: true })
  respBody!: string | null;

  /** True when the call succeeded (2xx and no transport error). */
  @Column({ type: 'boolean', default: false })
  ok!: boolean;

  @Column({ name: 'duration_ms', type: 'int', default: 0 })
  durationMs!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  /** True when served by the mock (dev) instead of the live service. */
  @Column({ type: 'boolean', default: false })
  mock!: boolean;

  /** A caller-supplied correlation id (e.g. the upload transaction_id). */
  @Column({ name: 'correlation_id', type: 'varchar', length: 128, nullable: true })
  correlationId!: string | null;

  /** The ERP record this call relates to, if any. */
  @Column({ name: 'entity_type', type: 'varchar', length: 128, nullable: true })
  entityType!: string | null;

  @Column({ name: 'entity_id', type: 'varchar', length: 128, nullable: true })
  entityId!: string | null;

  /** The user who triggered the call, if it came from an authed request. */
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;
}
