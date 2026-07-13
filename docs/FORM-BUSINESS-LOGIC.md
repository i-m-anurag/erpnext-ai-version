# Form-specific business logic ("form controllers")

The record screen and the master/document save path are **generic** — one component
renders every form, one service saves every record. Logic that belongs to **one
form** (deriving a status, computing a field, reacting to a save, extra buttons)
goes in a **form controller** registered for that form's slug, so the generic code
never fills up with `if (slug === …)` branches.

This mirrors ERPNext: a server-side DocType controller + a client-side form script,
both keyed by the doctype. Here they're keyed by the **master slug**.

The server is authoritative for **what a status is** (it computes and persists
`state`); the client only decides **how to present it** and what extra buttons to show.

---

## Backend — `backend/src/modules/form-logic/`

Implement `FormController` and register it. Hooks fire around the generic persist:

```
beforeSave → (persist) → computeStatus → (write state) → afterSave
```

```ts
// backend/src/modules/form-logic/controllers/<slug>.controller.ts
import type { FormController } from '../form-controller.js';

export const myFormController: FormController = {
  // Adjust/validate input before it is saved (mutate ctx.input; throw to reject).
  beforeSave(ctx) { /* … */ },

  // Derive the business status from the saved record (null = leave unchanged).
  computeStatus(doc) {
    if (doc.status === 'draft') return 'Draft';
    return someCondition(doc.data) ? 'Ordered' : 'Pending';
  },

  // Side effects after persist: linked docs, timeline, notifications.
  async afterSave(doc) { /* … */ },
};
```

Register it (one line per form):

```ts
// backend/src/modules/form-logic/register-form-controllers.ts
registerFormController('<slug>', myFormController);
```

`computeStatus`'s return value is written to the record's `state` column (via the
document table or `master_data.state`, whichever backs the slug). For a
Material-Request-style flow, `computeStatus` would inspect linked documents /
received quantities rather than a single field.

## Frontend — `frontend/src/app/core/form-logic/`

```ts
// frontend/src/app/core/form-logic/controllers/<slug>.controller.ts
import type { FormController } from '../form-controller';

export const myFormController: FormController = {
  // How the business-state badge looks.
  status(record) {
    return record.state === 'Ordered' ? { label: 'Ordered', tone: 'success' } : undefined;
  },
  // Extra header buttons (run gets a tiny { notify, reload } context).
  actions(record) {
    return [{ key: 'x', label: 'Do thing', icon: 'ph-flag',
              run: (rec, ctx) => ctx.notify(`${rec.code} done`) }];
  },
};
```

Register it (one line per form):

```ts
// frontend/src/app/core/form-logic/index.ts
registerFormController('<slug>', myFormController);
```

## Status + state in the header

The record header **always** shows the lifecycle **Status** (Draft/Active/Archived)
and, when present, the business **State** badge. The badge's colour comes from the
client controller's `status()`; with no controller it shows the raw state text.

## Cross-document propagation (linked docs driving status)

A controller's `afterSave` can update *other* documents — this is how one doc's
save advances another's status. The `purchase-order` controller does this: on save
it finds the requisition it was created from (via `documentService.links`), sums the
ordered quantities across **all** linked POs (so re-saves never double-count), writes
them onto the requisition lines, and re-saves the requisition through
`masterService.updateData` — which re-runs the requisition controller's
`computeStatus`, advancing it Pending → Partially Ordered → Ordered.

The same shape wires Purchase Receipt → `receivedQty` and Stock Entry →
`issuedQty` / `transferredQty`. To avoid the form-logic ↔ master import cycle,
import `masterService` lazily (`await import(...)`) inside the hook.

## Reference example

`purchase-order` is wired end-to-end on both sides as a copyable template:
- server: derives `Draft` / `Standard` / `High Value` from the amount, keeps the
  header amount in sync with line items, logs to the timeline;
- client: colours the badge and adds a "Flag for review" button for high-value orders.
