import type { BadgeTone, FormController } from '../form-controller';

/** Colour for each Material Request status. */
const TONE: Record<string, BadgeTone> = {
  Draft: 'default',
  Pending: 'info',
  'Partially Ordered': 'warn',
  Ordered: 'info',
  Received: 'success',
  Issued: 'success',
  Transferred: 'success',
  Stopped: 'danger',
  Cancelled: 'danger',
};

/**
 * Material Request (Requisition) client controller — pairs with the server one.
 * The server derives + persists the status; here we just colour the badge.
 */
export const requisitionController: FormController = {
  status(record) {
    return record.state ? { label: record.state, tone: TONE[record.state] ?? 'default' } : undefined;
  },
};
