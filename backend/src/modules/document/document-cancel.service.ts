import { AppDataSource } from '../../db/data-source.js';
import { BadRequestError } from '../../shared/errors.js';
import { ledgerService } from '../ledger/ledger.service.js';
import { stockLedgerService } from '../stock/stock-ledger.service.js';
// The registry file only — never the controllers barrel — so this stays free of the
// document ↔ form-logic import cycle (the controllers import back into this module).
import { getFormController } from '../form-logic/form-controller.js';
import { documentDataService } from './document-data.service.js';

export interface CancelResult {
  /** Did anything actually reverse? False when the document was already cancelled. */
  posted: boolean;
  /** Whether each ledger had something to undo. */
  reversedGl: boolean;
  reversedStock: boolean;
}

/**
 * Cancelling a submitted document.
 *
 * A document can touch two ledgers, and undoing only one is worse than undoing
 * neither: reversing a Purchase Receipt's accounting while leaving its stock on the
 * shelf makes Stock In Hand disagree with the warehouse, silently, with no error.
 * So both reversals happen here, in ONE transaction — either the whole cancellation
 * lands or none of it does.
 *
 * Neither ledger is edited. Both are append-only, so a cancellation posts opposite
 * entries under `<code>-REV` and the original history stays readable. Both reversals
 * are idempotent, so a double-click cancels once.
 *
 * The stock reversal runs FIRST because it is the one that can legitimately refuse —
 * you cannot un-receive goods that have already been issued. Failing before the GL is
 * touched means a refused cancellation leaves nothing behind to clean up.
 */
export const documentCancelService = {
  async cancel(voucherType: string, voucherNo: string, postingDate: Date | string): Promise<CancelResult> {
    const [hasStock, hasGl] = await Promise.all([
      stockLedgerService.hasEntries(voucherType, voucherNo),
      ledgerService.hasEntries(voucherType, voucherNo),
    ]);
    if (!hasStock && !hasGl) {
      throw new BadRequestError(`nothing to reverse for ${voucherType} ${voucherNo}`);
    }

    return AppDataSource.transaction(async (manager) => {
      let stockPosted = false;
      let glPosted = false;

      if (hasStock) {
        const r = await stockLedgerService.reverse(voucherType, voucherNo, postingDate, manager);
        stockPosted = r.posted;
      }
      if (hasGl) {
        const r = await ledgerService.reverse(voucherType, voucherNo, postingDate, manager);
        glPosted = r.posted;
      }

      // Let the document's controller undo whatever it did to OTHER documents (e.g. a
      // Stock Entry giving fulfilled quantity back to its Material Request). Only when
      // this call actually reversed something — a second, idempotent cancel is a no-op.
      const controller = getFormController(voucherType);
      if ((stockPosted || glPosted) && controller?.afterReverse) {
        const doc = await documentDataService.getByCode(voucherType, voucherNo).catch(() => null);
        if (doc) {
          await controller.afterReverse(
            { slug: voucherType, id: doc.id, code: doc.code, data: doc.data, status: doc.status, state: doc.state },
            { manager },
          );
        }
      }

      return { posted: stockPosted || glPosted, reversedGl: hasGl, reversedStock: hasStock };
    });
  },
};
