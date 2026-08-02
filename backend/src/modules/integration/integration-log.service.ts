import { AppDataSource } from '../../db/data-source.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { NotFoundError } from '../../shared/errors.js';
import { ApiCallLog } from './api-call-log.entity.js';

/** Columns shared by api_call_log and its archive (for the move query). */
const LOG_COLUMNS =
  'id, created_at, provider, operation, method, url, req_content_type, req_headers, req_body, ' +
  'resp_status, resp_body, ok, duration_ms, error_message, mock, correlation_id, entity_type, entity_id, actor_user_id';

/** Read access to the outbound-API audit trail (api_call_log) for the Admin viewer. */
export class IntegrationLogService {
  private readonly repo = new BaseRepository(ApiCallLog);

  /** Most-recent calls first, optionally filtered by provider. */
  async list(opts: { provider?: string; limit?: number } = {}): Promise<ApiCallLog[]> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    return this.repo.find({
      where: opts.provider ? { provider: opts.provider } : {},
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async get(id: string): Promise<ApiCallLog> {
    const row = await this.repo.findOne({ id });
    if (!row) throw new NotFoundError('log entry not found');
    return row;
  }

  /**
   * Move rows older than `retentionDays` from api_call_log into
   * api_call_log_archive in one transaction (a data-modifying CTE, so no window
   * where a row exists in neither table). Returns how many were archived. Called
   * periodically by the worker to keep the live log clean.
   */
  async archiveOlderThan(retentionDays: number): Promise<number> {
    const rows = (await AppDataSource.query(
      `WITH moved AS (
         DELETE FROM api_call_log
          WHERE created_at < now() - make_interval(days => $1)
         RETURNING ${LOG_COLUMNS}
       )
       INSERT INTO api_call_log_archive (${LOG_COLUMNS})
       SELECT ${LOG_COLUMNS} FROM moved
       RETURNING id`,
      [retentionDays],
    )) as { id: string }[];
    return rows.length;
  }
}

export const integrationLogService = new IntegrationLogService();
