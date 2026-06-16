# Design: Workflow + Assignment + Communication Engine

Status: **design / not yet built** (today we shipped #1 — tabular forms). Decisions
locked with the product owner:

| Decision | Choice |
|---|---|
| What workflow/assignment runs on | **Generic master entities + a `state` field** (config-driven; reuses master system) |
| Async execution | **BullMQ + a dedicated worker process** (Redis-backed) |
| Timeline / comments | **Build the real backend now** (workflow & assignment feed it) |
| Transaction write model | **Sync + durable** (record/state/assignment in one Postgres tx); **only side-effects queued**. No write-behind cache. Reads stay cached. |
| Defaults vs UI edits | **base/custom scopes** — seed maintains `base` (idempotent, every deploy); UI writes `custom` overrides that always win. No "seed-if-empty" check. |
| Workflow/assignment editor (v1) | **Table/form editor** built with the dynamic-form engine + the tabular field (states table + transitions table). Visual diagram later. |
| Email template editor | **WYSIWYG + merge-tags + live preview** (TinyMCE/Quill class), optional HTML-source toggle. GrapesJS only if rich layouts needed later. |

## Latency model (hard requirement: the interactive path feels instant)

The request path does the **minimum durable work** and returns:

```
POST save / transition:
  validate
  BEGIN
    write record + state (+ assignment row if a rule matched)   ← sync, ~ms
  COMMIT
  publish(event)            ← BullMQ add = one Redis call, sub-ms (fire-and-forget)
  return 200                ← user sees success immediately
```

Everything eventually-consistent runs in the **worker**: emails, notifications,
webhooks, heavy recompute. The only thing "delayed" is the email — acceptable.

- **No write-behind cache for primary writes** — durability matters more than a
  micro-optimisation that doesn't address the real latency source (sync external
  calls / N+1, not the DB commit). Reads use the existing Redis cache (config +
  options). For genuine bulk writes, add explicit **batch endpoints** (many rows,
  one tx) — not a write-behind layer.
- **Assignment is written synchronously** (cheap: one candidate-pick + one insert)
  so "Assigned to X" shows instantly; only its notification email is async.
- **Timeline** entries for the actor's own action are written sync (one cheap
  insert) so the activity feed updates immediately; bulk/derived timeline can be
  async.

These three features share one backbone: an **event → queue → handlers** pipeline.
Workflow transitions and assignment both emit domain events; handlers (run in the
worker) write timeline entries, send emails, and apply assignments. Build the
shared plumbing first, then the three features layer on top.

---

## 0. Shared backbone (build first)

### 0a. Domain events + BullMQ
- New `shared/events/` — a tiny typed emitter `publish(event)` that enqueues a
  BullMQ job onto a Redis queue (`automation` queue). No in-process handlers; the
  **worker** consumes.
- New process: `backend/src/worker.ts` (BullMQ `Worker`) — its own entry, started
  alongside the API. Add to `start.sh` (step 7) and to the prod compose later.
- Config: reuse `env.redis`. Add `WORKER_CONCURRENCY` to config schema.
- Event shape:
  ```ts
  interface DomainEvent {
    type: 'master.created' | 'master.updated' | 'master.state_changed';
    masterSlug: string;
    recordId: string;          // master_data.id
    code: string;              // natural key (e.g. PO number)
    actorUserId: string | null;
    before?: Record<string, unknown>;
    after: Record<string, unknown>;
    fromState?: string; toState?: string;   // for state_changed
  }
  ```
- Emit points: `MasterService.createData/updateData` and the new transition API
  call `publish(...)` **after commit**.

### 0b. State on master data
- Migration: add `state varchar(48) null` to `master_data` (distinct from the
  existing `status` active/archived).
- `MasterRegistry`: add `workflowSlug varchar(128) null`. A master with a
  workflow is "stateful"; its rows carry a `state`.
- On create of a workflow-enabled master, `state` defaults to the workflow's
  start state.

### 0c. Timeline + comments (real backend)
- New module `modules/activity/`:
  - Entity `Timeline` (`timeline` table): `id, masterSlug, recordId, kind
    ('created'|'updated'|'state_changed'|'assigned'|'commented'|'email_sent'),
    summary, data jsonb, actorUserId, createdAt`.
  - Entity `Comment` (`comments` table): `id, masterSlug, recordId, body,
    authorUserId, createdAt, updatedAt`.
  - API: `GET /api/activity/:masterSlug/:recordId/timeline`,
    `GET/POST /api/activity/:masterSlug/:recordId/comments`.
  - Permissions: `activity:view`, `activity:comment`.
- Worker handlers append timeline rows on every event; the record view reads them
  (replaces the current mock timeline/comments).

---

## 1. Workflow (ERPNext-style)

Reference: docs.frappe.io/erpnext/workflows + workflow-actions.

### Config resource: `workflow`
Stored in `config_resources` (resourceType `workflow`), base/custom layered,
resolved + cached like forms. Register in `register-resources.ts`.

```jsonc
{
  "slug": "purchase-order",            // 1:1 with the master slug it governs
  "appliesTo": "purchase-order",       // master slug
  "stateField": "state",
  "states": [
    { "name": "Draft",     "doc_status": 0, "style": "secondary" },
    { "name": "Pending",   "doc_status": 0, "style": "warning" },
    { "name": "Approved",  "doc_status": 1, "style": "success" },
    { "name": "Rejected",  "doc_status": 2, "style": "danger" }
  ],
  "transitions": [
    { "action": "Submit",  "from": "Draft",    "to": "Pending",  "allowed": ["purchase-user"],
      "condition": null },
    { "action": "Approve", "from": "Pending",  "to": "Approved", "allowed": ["purchase-manager"],
      "condition": "doc.total <= 100000" },
    { "action": "Reject",  "from": "Pending",  "to": "Rejected", "allowed": ["purchase-manager"] }
  ]
}
```

- **`allowed`**: role codes (existing `roles.code`). Gate = current user has one of
  those roles (reuse the session permission/role snapshot).
- **`condition`**: a *safe* expression over the record (`doc.*`). Start with a
  tiny whitelisted evaluator (comparisons + `&& || ()`); **no `eval`**. Keep the
  grammar minimal in v1; expand later.
- **`doc_status`** mirrors ERPNext (0 draft / 1 submitted / 2 cancelled) for
  parity and to gate edits (submitted docs are read-only unless a transition
  allows amend).

### Module `modules/workflow/`
- `workflow.resource.ts` — Zod schema + register.
- `workflow.service.ts`:
  - `getWorkflow(slug)` → resolved definition.
  - `availableActions(masterSlug, record, userRoles)` → transitions whose `from`
    == current state AND role allowed AND condition passes.
  - `applyTransition(masterSlug, recordId, action, actor)`:
    1. load row + workflow, 2. validate the action is available, 3. set
    `state = to`, save, 4. `publish('master.state_changed', …)`.
- `workflow.routes.ts`:
  - `GET  /api/workflow/:masterSlug/:recordId/actions` → allowed actions for me.
  - `POST /api/workflow/:masterSlug/:recordId/transition` `{ action }`.
  - Permissions: `workflow:view`, `workflow:transition` (role/condition enforced
    in the service on top).

### Workflow actions (side effects on transition)
Optional `onEnter` per state OR `actions` per transition in the definition:
```jsonc
"actions": [
  { "type": "email",  "template": "po-approved", "to": "{{doc.requestedBy}}" },
  { "type": "assign", "rule": "po-approvers" },
  { "type": "set",    "field": "approvedAt", "value": "now" }
]
```
These are **emitted as part of the state_changed event** and executed by the
worker (so email/assign run async). `set` runs inline before save.

### Frontend
- The record view already renders a **workflow stepper** (states) — drive it from
  the resolved workflow instead of the mock.
- Add an **action bar**: buttons for `availableActions` → POST transition → toast +
  refresh + new timeline entry.
- Admin: a **Workflow editor** built with the dynamic-form engine + the tabular
  field — header (slug, appliesTo, stateField) + a **states** table + a
  **transitions** table (action, from, to, allowed-roles, condition). Saves to
  `config_resources` at `scope:'custom'` via the templates-style CRUD API, so it's
  fully UI-managed after the initial base seed. Visual drag-drop diagram is a
  later upgrade.

---

## 2. Assignment rules

Reference: docs.frappe.io/erpnext/assignment-rule.

### Config resource: `assignment_rule`
```jsonc
{
  "slug": "po-approvers",
  "appliesTo": "purchase-order",
  "assignTo": { "type": "role", "value": "purchase-manager" },   // or "users": [...]
  "rule": "round_robin",            // round_robin | load_balancing | by_field
  "byField": null,                   // for by_field: a field whose value is a userId
  "applyOn": { "event": "state_changed", "toState": "Pending" }, // or "created"
  "condition": "doc.total > 50000",
  "notify": { "template": "po-assigned" },
  "unassignOn": { "state": "Approved" }
}
```

### Module `modules/assignment/`
- Entity `Assignment` (`assignments` table): `id, masterSlug, recordId, userId,
  ruleSlug, status ('open'|'closed'), assignedAt, closedAt`.
- `assignment.service.ts`:
  - `candidates(rule)` → users (by role via `user_roles`, or explicit list, or
    `by_field`). Reuse `permissionService.userIdsWithRole` (expose it).
  - `pick(rule, candidates)` → round-robin (counter in a small `assignment_state`
    row or Redis `INCR`), or load-balancing (fewest open assignments — `COUNT`
    query), or `by_field`.
  - `assign(masterSlug, recordId, rule)` → create Assignment, `publish` →
    timeline + `notify` email.
- Triggered by the worker on matching events (`applyOn`).
- API: `GET /api/assignments?me=1` (my open assignments — drives a worklist),
  `POST /api/assignments/:id/close`. Permissions `assignment:view`,
  `assignment:manage`.

### Frontend
- "Assigned to" chip on the record + an **inbox/worklist** ("My assignments").
- Admin viewer for rules (editor later).

---

## 3. Communication engine

**Half-built already** — reuse: templates live in `config_resources`
(`email_template`), `emailService.send(slug, to, vars)` renders `{{var}}` and
sends via `mailer` → Mailhog. Missing: **UI CRUD** + **triggers** + **async**.

### 3a. Template CRUD + UI
- API `modules/communication/` additions:
  - `GET  /api/templates` (list — resolved base+custom),
  - `GET  /api/templates/:slug`,
  - `PUT  /api/templates/:slug` → `configResolver.upsert(type,slug,'custom',def)`,
  - `POST /api/templates` (new custom), `DELETE` → archive.
  - Permissions: `template:view|manage`.
- Frontend (Administration → **Communication / Templates**): **WYSIWYG editor**
  (TinyMCE or Quill, MIT) for the HTML body, plus:
  - subject, text fallback, declared `variables` list;
  - a **merge-tag inserter** — dropdown of the template's declared variables that
    drops `{{var}}` at the cursor (no typing placeholders);
  - a **live preview** pane rendered with sample vars (reuse `renderTemplate`);
  - optional **HTML-source toggle** (CodeMirror) for power users.
  - Validate every `{{placeholder}}` is declared (render contract already enforces
    this server-side). Store the editor's HTML output in the template's `html`
    field at `scope:'custom'`.
  - *Editor pick:* Quill (lighter) or TinyMCE (richer). GrapesJS + MJML is a later
    upgrade only if marketing-grade drag-drop layouts are needed.

### 3b. Triggers (event → template → recipients)
New config resource `email_trigger` (or fold into workflow/assignment actions):
```jsonc
{
  "slug": "po-approved",
  "on": { "event": "master.state_changed", "masterSlug": "purchase-order", "toState": "Approved" },
  "template": "po-approved",
  "to": ["{{doc.requestedBy}}", "role:purchase-manager"],
  "condition": "doc.total > 0"
}
```
- Worker subscribes to events, matches triggers, resolves recipients (literal,
  `{{doc.field}}`, or `role:<code>` → emails), and calls `emailService.send`.
- Every send writes an `email_sent` timeline entry.

### 3c. Async sending
- Move `emailService.send` call-sites (auth password-reset/welcome too) to enqueue
  an `email` job; the worker sends. Keeps requests fast and gives retries/backoff
  (BullMQ) + a dead-letter for failures.

---

## Build order (suggested, post-#1)

1. **Backbone**: BullMQ + worker process, `DomainEvent` + `publish`, emit from
   MasterService; `state` column + `workflowSlug`; activity module (timeline +
   comments) with real APIs; point the record view at real timeline/comments.
2. **Workflow**: resource + service + transition API + stepper/action bar; seed a
   `purchase-order` workflow; gate edits by `doc_status`.
3. **Communication**: template CRUD API + Admin editor + live preview; move sends
   to the queue.
4. **Triggers**: `email_trigger` resource + worker matcher (wire PO-approved mail).
5. **Assignment**: rules resource + service (round-robin/load-balancing) + worker
   trigger + "My assignments" worklist + assigned-to chip.

## New permissions to seed
`workflow:view|transition`, `assignment:view|manage`, `activity:view|comment`,
`template:view|manage`.

## Open questions for later
- Condition grammar depth (v1 = comparisons; later = functions/dates?).
- Multi-level / parallel approvals (v1 = linear states).
- In-app notifications (v1 = email only; add a `notifications` table + bell later).
- Escalation / SLA timers on assignments (needs scheduled jobs — BullMQ repeat).
