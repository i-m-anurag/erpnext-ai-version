import { configResolver } from '../config/index.js';
import { APPROVAL_MATRIX_RESOURCE_TYPE, type ApprovalMatrix } from './approval-matrix.schema.js';

/** Reads the approval matrix (role×branch→limit) and answers limit queries. */
export class ApprovalMatrixService {
  async get(): Promise<ApprovalMatrix> {
    const eff = await configResolver.resolve<ApprovalMatrix>(APPROVAL_MATRIX_RESOURCE_TYPE, 'default');
    return eff.definition;
  }

  /** The approval limit for a (role, branch), or null if the matrix has no entry. */
  async limitFor(role: string, branch: string): Promise<number | null> {
    const m = await this.get();
    const e = m.entries.find((x) => x.role === role && x.branch === branch);
    return e ? e.limit : null;
  }
}

export const approvalMatrixService = new ApprovalMatrixService();
