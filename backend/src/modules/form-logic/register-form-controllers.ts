import { registerFormController } from './form-controller.js';
import { purchaseOrderController } from './controllers/purchase-order.controller.js';
import { requisitionController } from './controllers/requisition.controller.js';
import { purchaseInvoiceController } from './controllers/purchase-invoice.controller.js';
import { paymentEntryController } from './controllers/payment-entry.controller.js';
import { journalEntryController } from './controllers/journal-entry.controller.js';
import { purchaseReceiptController } from './controllers/purchase-receipt.controller.js';

let registered = false;

/**
 * Register every per-form business-logic controller at startup. Add one line here
 * per form that needs custom logic. Guarded so it's safe to call more than once.
 */
export function registerFormControllers(): void {
  if (registered) return;
  registered = true;
  registerFormController('purchase-order', purchaseOrderController);
  registerFormController('requisition', requisitionController);
  registerFormController('purchase-invoice', purchaseInvoiceController);
  registerFormController('payment-entry', paymentEntryController);
  registerFormController('journal-entry', journalEntryController);
  registerFormController('purchase-receipt', purchaseReceiptController);
}
