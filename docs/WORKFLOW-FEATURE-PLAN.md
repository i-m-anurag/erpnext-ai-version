# Workflow Feature — Implementation Plan

> Status: **planning / brainstorm.** Covers three work-items: (1) transaction
> assignment + workflow-driven form gating, (2) the mail service & communication
> engine, (3) the testing plan for the workflow implementation.
>
> Important: a lot already exists. This plan is written against the current code —
> each item marks what is **built**, what is **missing**, and the concrete steps to
> close the gap. It builds on the existing config-driven workflow engine, RBAC, and
> document tables.

---

## 0. Current state (what we're building on)

Grounding facts from the codebase, so the plan is additive, not a rewrite:

**Workflow engine — mostly complete.** `backend/src/modules/workflow/`
- Definition: `states[]` + `rules[]` (trigger `{action, fromState, roles}` → `branches[]` of `conditions` + `actions`). `workflow.schema.ts`.
- Transition flow: `workflow.service.ts → runAction()` loads the record, checks the user's roles, finds matching rules/branch, runs its actions, persists the record. `status()` returns the actions the current user may fire (role + state pre-filtered).
- Action types (`workflow.actions.ts`): **set_state, set_field, assign, email** — all implemented.
- Role gating on transitions works (`trigger.roles` vs `permissionService.rolesForUser`).
- State persists on the record (`state` column on `master_data` / document tables).

**Assignment — entity + creation exist, everything around it is missing.**
- `assignment.entity.ts`: `assignments` table (`entityType, recordId, assigneeUserId, status open|closed, ruleName`), indexed on `(assigneeUserId, status)` and `(entityType, recordId)`.
- `runAssign()` picks an assignee (`least_loaded` / `round_robin`), inserts one `open` row, logs a timeline `assigned` entry.
- **Missing:** no AssignmentService (queries), no `/api/assignments` routes, no worklist UI, no reassign/close, no "close on transition", no assignee-based gating.

**Communication — complete for email, single-channel.**
- Templates are config (`config_resources` type `email_template`), seeded from `seed-data/base/email-templates/*.json`, rendered by `renderTemplate()` with a strict variable contract.
- `EmailService.send(slug, to, vars)` → `mailer.service.ts` (nodemailer → Mailhog in dev).
- Async: BullMQ `email` queue (`queue/queues.ts`, `enqueueEmail`) + `worker.ts` (`emailWorker`, concurrency 5, retries w/ backoff).
- Workflow `email` action resolves recipients: `role:<code>`, `{{doc.<field>}}`, literal address.
- **Missing:** delivery/audit log, in-app notifications, a channel abstraction, template preview/test-send, idempotency guard.

**Frontend gating — minimal.** `record-view.component.ts`
- Renders the workflow stepper + action buttons from `WorkflowStatus.actions` (server-filtered).
- Buttons disabled **only** while transitioning/saving. **No** state-based or assignee-based restriction on Save/Submit/Create-next/edit.

---

## 1. Transaction assignment + workflow-driven form gating

Two connected concerns: (1a) track who each transaction is assigned to across roles/steps, and (1b) restrict form actions until the right workflow step/assignee condition is met.

### 1a. Assignment tracking

**Extend the `assignments` table** (additive migration) so it records the *context* of each assignment, giving a full history across roles and steps:

| add column | why |
|---|---|
| `role` | which role the task was assigned *as* (e.g. Approver) — enables "track over different roles" |
| `state` | the workflow state/step the assignment belongs to (e.g. "Pending Approval") |
| `assigned_by_user_id` | who/what triggered it (a user, or the workflow) |
| `rule_name` | already exists — which rule created it |
| `created_at` / `closed_at` | timestamps for the audit trail and ageing |
| `due_at` (optional) | SLA / overdue reporting later |

Assignments are **never deleted** — they are `closed`. The set of rows for a record, ordered by time, *is* the assignment history ("this txn went Requester → Approver → …"). This mirrors the append-only discipline we chose for the ledger.

**New `AssignmentService`** (`backend/src/modules/workflow/assignment.service.ts`):
- `forUser(userId, {status})` — the worklist ("my open tasks").
- `forRecord(entityType, recordId)` — the assignment history panel + the "who's it with now" lookup.
- `reassign(id, toUserId, byUserId)` — close the old, open a new (history preserved), timeline entry.
- `closeOpenFor(entityType, recordId, {state?})` — called from the transition flow.
- `activeAssignee(entityType, recordId)` — the current open assignee, for gating (1b).

**Close-on-transition.** In `workflow.service.runAction()`, after a `set_state`, **close the open assignments for the record's previous state** (a step is done when the state advances) so the worklist stays accurate. New `assign` actions in the new state open fresh ones.

**Routes** (`assignment.routes.ts`, gated by existing RBAC):
- `GET /api/assignments/mine?status=open` — worklist.
- `GET /api/assignments/:master/:code` — record history.
- `POST /api/assignments/:id/reassign` — `{ toUserId }`.

**Frontend:**
- `AssignmentApiService` + a **"My Work" worklist** screen (ag-grid: record, type, state, assigned date, age → click opens the record).
- On the record view: an **"Assigned to"** line (current open assignee) + the assignment history in the activity panel (the timeline already logs `assigned`).
- A **reassign** control (permission-gated) on the record.

### 1b. Workflow-driven form gating

Today the form lets you Save/Submit/Create-next from any state, by anyone. We add three layers of restriction — **enforced on the backend, reflected on the frontend** (never frontend-only).

**(i) State-based editability.** A record should be freely editable only in its editable states (typically `Draft`). Once submitted, the field form is read-only and "Save/Submit" is hidden — changes only happen through workflow actions (or an explicit "amend" that reopens to Draft). Make the editable states **config on the workflow** (e.g. `editableStates: ["Draft"]`, default = the start state). Backend enforces (reject a data update when the record isn't in an editable state); frontend renders the form read-only + hides Save.

**(ii) Assignee-based action gating.** A workflow action can require the actor to be the **current open assignee** (not just hold the role). Add an optional `requiresAssignee: true` on a rule's trigger. Backend `runAction()` checks `activeAssignee(...) === userId` when set; frontend disables the button with a hint ("Assigned to Priya") when the user isn't the assignee.

**(iii) Config-driven button rules ("gate the next step").** The user's core ask — *other buttons stay restricted until the workflow step is complete*. Model this as **per-state UI rules** on the workflow definition, e.g.:

```jsonc
"states": [
  { "name": "Draft",            "allow": ["save", "submit"] },
  { "name": "Pending Approval", "allow": ["approve", "reject"], "formReadOnly": true },
  { "name": "Approved",         "allow": ["create-next"], "formReadOnly": true }
]
```

- `create-next` (e.g. "Create Purchase Invoice") is **hidden until `Approved`** — you can't raise the next document until this one is approved.
- The record view reads the current state's `allow` list and shows only those buttons; the backend re-checks on each action/create-next call (defence in depth).
- This keeps the gating **configuration**, consistent with forms/workflows/posting-rules — no per-form code.

**Where it plugs in:**
- Backend: `workflow.schema.ts` (add `editableStates`, per-state `allow`/`formReadOnly`, `requiresAssignee`); `workflow.service.ts` (enforce in `runAction` + a small guard used by the data-update and create-next paths); `master.service`/`documentDataService` update path (reject edits in non-editable states).
- Frontend: `record-view.component.ts` (compute allowed buttons + form-read-only from `WorkflowStatus`; the API returns the current state's `allow` + `formReadOnly` + `isAssignee`).

---

## 2. Mail service & communication engine

The email pipeline is built and solid (templates-as-config → render → BullMQ queue → worker → nodemailer). This item is about **hardening it into a general communication engine** and adding the pieces a workflow-heavy ERP needs.

### 2.1 What stays (already good)
- Templates as versioned config (base + client override), strict variable contract, WYSIWYG-editable.
- Async send via BullMQ with retries/backoff; worker isolated from the request path.
- Recipient tokens (`role:`, `{{doc.field}}`, literal).

### 2.2 Additions

**(a) Delivery log (audit + ret/troubleshoot).** New `notification_log` table: `channel, template, to, subject, status (queued|sent|failed), error, entityType, recordId, created_at, sent_at`. Written by the worker on success/failure. Powers a "was the approval email actually sent?" answer and a simple admin view. Today only a timeline `email_sent` line exists — not enough to debug bounces.

**(b) Channel abstraction (future-proofing).** Introduce a `NotificationService.notify({ channel, template, to, vars, context })` in front of the email service. `channel: 'email'` now; `'in_app'`, `'sms'`, `'webhook'` later slot in without touching callers. The workflow `email` action becomes a `notify` action (email as the default channel) — backward compatible.

**(c) In-app notifications.** New `notifications` table (`userId, title, body, link, read, created_at`) + a bell/feed in the app shell. Assignment ("You've been assigned PO-123") and state-change events write in-app notifications alongside (or instead of) email. This is the highest-value add for day-to-day workflow use and reuses the event bus.

**(d) Idempotency + dedupe.** Key each send by `(template, to, entityType, recordId, purpose)` so a retried transition doesn't email twice. Cheap unique-guard in `notification_log`.

**(e) Recipient resolution — extend** to `assignee` and `requester` tokens (resolve the current open assignee / the record's creator), so "notify the approver" is one token, not a role dump.

**(f) Template management UX.** Build on the existing Quill editor: a **preview** with sample vars and a **test-send** button (send to me), plus surfacing the declared variable list. Prevents broken `{{placeholders}}` reaching production.

**(g) Events, not direct calls.** Assignment/state-change should **emit domain events** (existing BullMQ `events` queue) and a notifications subscriber turns them into email/in-app messages. Keeps the transition path fast and decouples "what happened" from "who gets told" — and feeds the future AI layer.

> Scope note: SMS/WhatsApp/webhook are explicitly **later**; the channel abstraction just reserves the seam. Email + in-app cover the workflow needs now.

---

## 3. Testing plan for the workflow implementation

Test at four layers, matching the existing Vitest setup (`unit` + `integration` projects; integration runs serially against live Postgres/Redis/Mailhog). Aim: every rule path, every gate, and the assignment lifecycle are covered before this ships.

### 3.1 Unit tests (pure logic, no DB) — `*.spec.ts`
- **Condition evaluator** (`condition.ts`): each operator (`== != < <= > >=`), type coercion, missing field, empty-conditions = else branch.
- **Rule matching** (`matchingRules`): action name match, `fromState` match/any, role gating (empty roles = anyone; has-one-of; has-none → excluded).
- **Branch selection**: first matching branch wins; falls through to else; no match → no-op.
- **Recipient resolution** (`resolveRecipients`): `role:` expansion, `{{doc.field}}` with/without `@`, literal, dedupe, `assignee`/`requester` (new).
- **Assignee selection** (`runAssign`): `least_loaded` picks the fewest open; empty candidate pool handled; explicit users + role union + dedupe.
- **Template render** (`renderTemplate`): all vars supplied, missing var throws, unknown placeholder throws, subject+html+text substitution.
- **Gating helpers** (new): editable-state check, per-state `allow` list, `requiresAssignee`.

### 3.2 Integration tests (live DB) — `*.int.spec.ts`
- **Full lifecycle**, both `master` and `document` kinds: Draft → Submit → Pending Approval → Approve → Approved; and Reject → Rejected → Reopen → Draft. Assert `state` persisted each step.
- **Role gating**: wrong-role user → transition rejected (403); right-role → succeeds.
- **State gating**: data update rejected when not in an editable state; allowed in Draft.
- **Assignee gating**: `requiresAssignee` action denied for a non-assignee, allowed for the assignee.
- **Assignment lifecycle**: `assign` creates an `open` row with `role`/`state`; advancing state **closes** the prior step's assignments; `reassign` closes old + opens new (history preserved); `forUser`/`forRecord` return the right sets.
- **Email side-effects**: `email`/`notify` action **enqueues** a job (assert the queue got it — mock/inspect BullMQ) and a `notification_log` row is written; idempotency guard blocks a duplicate.
- **Set_field**: mutates record data and persists.

### 3.3 API / e2e (HTTP, real auth)
- `/api/workflow/:master/:code/status` returns only the actions the user may fire, plus (new) `allow`, `formReadOnly`, `isAssignee`.
- `/api/workflow/:master/:code/transition` enforces role/state/assignee (200 vs 403/400).
- `/api/assignments/*`: worklist, record history, reassign — permission-gated.
- Idempotent transition: firing the same action twice doesn't double-assign / double-email.

### 3.4 Frontend
- Record view: stepper reflects state; only `allow`-listed buttons render; Save/Submit hidden when `formReadOnly`; action button shows the "not assignee" hint when gated.
- Worklist screen: lists my open assignments; row click opens the record; reassign updates the list.

### 3.5 Manual / QA scenarios (checklist)
- Happy path per document type (Requisition → PO → Receipt/Invoice) end-to-end with two users (submitter + approver).
- Concurrent transitions on the same record (two approvers click Approve) — one wins, the other gets a clean error, no double-post.
- Overdue/reassign flow; email actually lands in Mailhog with correct recipients + rendered template.
- Permission edge: user loses a role mid-flow → their pending buttons disappear on reload.

### 3.6 Fixtures & tooling
- A dedicated **test workflow** + test users with distinct roles (submitter, approver) seeded for integration runs.
- Assert emails via **Mailhog's API** (already used in auth tests) for real-delivery checks; use queue inspection for enqueue-only assertions.
- Keep integration serial (`fileParallelism: false`) — shared DB/queue state.

---

## 4. Suggested build order

1. **Assignment service + routes + close-on-transition** (backend) — turns the existing dead-end `assignments` table into a usable worklist. Migration adds `role`/`state`/`assigned_by`/timestamps.
2. **Assignee + state gating** (backend enforce) — `editableStates`, `requiresAssignee`, per-state `allow`; guard the data-update and transition paths.
3. **Frontend: worklist + record-view gating** — buttons/read-only from `WorkflowStatus`; "My Work" screen; reassign.
4. **Communication: delivery log + idempotency + in-app notifications** — `notification_log`, `notifications` table + bell, event-driven notifier, `notify` action.
5. **Template preview/test-send** polish.
6. **Tests throughout** (3.1–3.4 alongside each step; 3.5 before release).

---

## 5. Decisions to confirm

1. **Editable states:** is `Draft`-only editable the right default, or do some states allow edits (e.g. Approver can tweak before approving)?
2. **Assignee gating scope:** should *most* approval actions require being the assignee, or only where a rule opts in (`requiresAssignee`)? (Plan assumes opt-in.)
3. **Assignment granularity:** one open assignment per record at a time, or multiple parallel (e.g. two approvers)? (Plan assumes one active step; parallel is a later extension.)
4. **Notifications default channel:** email + in-app both by default, or per-workflow choice?
5. **Amend flow:** after approval, is "amend" (reopen to Draft, new version) in scope now, or later?
6. **Create-next gating:** gate it purely by state (`Approved`), or also by role/assignee?
