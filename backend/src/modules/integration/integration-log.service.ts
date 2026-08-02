import { BaseRepository } from '../../shared/base.repository.js';
import { NotFoundError } from '../../shared/errors.js';
import { ApiCallLog } from './api-call-log.entity.js';

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
}

export const integrationLogService = new IntegrationLogService();
