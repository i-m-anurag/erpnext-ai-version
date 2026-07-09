import { registerFormController, getFormController } from './form-controller';
import { purchaseOrderController } from './controllers/purchase-order.controller';
import { requisitionController } from './controllers/requisition.controller';

export {
  getFormController,
  registerFormController,
  type FormController,
  type FormRecord,
  type FormAction,
  type FormActionCtx,
  type StatusBadge,
  type BadgeTone,
} from './form-controller';

let done = false;

/**
 * Register every client-side form controller. Add one line per form. Idempotent —
 * safe to call from app bootstrap or a component. Call before the record view reads
 * controllers.
 */
export function registerFormControllers(): void {
  if (done) return;
  done = true;
  registerFormController('purchase-order', purchaseOrderController);
  registerFormController('requisition', requisitionController);
}
