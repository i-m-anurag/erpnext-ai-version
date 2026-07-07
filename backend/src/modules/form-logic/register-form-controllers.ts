import { registerFormController } from './form-controller.js';
import { purchaseOrderController } from './controllers/purchase-order.controller.js';

let registered = false;

/**
 * Register every per-form business-logic controller at startup. Add one line here
 * per form that needs custom logic. Guarded so it's safe to call more than once.
 */
export function registerFormControllers(): void {
  if (registered) return;
  registered = true;
  registerFormController('purchase-order', purchaseOrderController);
}
