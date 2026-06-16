# Engines Guide — Workflow · Communication · Assignment

How to use the reusable platform engines and attach them to **any** form/entity or
call them from an external **portal**. These engines are generic and
**config-driven** — you don't write code per entity; you configure them (from the
UI or via seed files) and they apply.

> The Inventory **Item** and Procurement **Purchase Order** entities in the app are
> just **test harnesses** that exercise these engines. Use the same recipe for your
> own entities.

---

## 0. Core model you need to know

### Entities = the generic "master" system
Every business entity is a **master**: a registry row (`master_registry`) + its data
rows (`master_data`, JSONB) + a **form** that defines/validates its fields. Adding an
entity = seed a master + a form (no bespoke screens). The List + Record screens are
generated from the form by the config-driven view engine.

- A master: `seed-data/base/masters/<slug>.json`
- Its form: `seed-data/base/forms/<formSlug>.json`
- Record id = the master's `codeField` value (e.g. a PO number).

### base vs custom (how "seed once, then edit in UI" works)
All configurable resources (forms, **workflows**, **email templates**, assignment
rules) are stored as **config resources** with two scopes:

- **`base`** — shipped defaults, (re)written by **seeding** every deploy (idempotent).
- **`custom`** — overrides written from the **UI**. Custom **always wins** and is
  **never clobbered** by re-seeding.

So: ship a sensible default in a seed file; admins tweak it in the UI; upgrades keep
shipping new base defaults without touching customer edits. "Reset to default" in the
UI deletes the custom override.

### Events + worker (async side-effects)
After a record changes, the API publishes a **domain event** to a BullMQ queue and
returns immediately (the request stays fast). A separate **worker process**
(`npm run worker`) consumes events and does the slow/eventually-consistent work
(emails, assignment notifications). Events today:

| Event | When |
|---|---|
| `master.created` | a master row is created |
| `master.updated` | a master row is updated |
| `master.state_changed` | a workflow transition runs (`fromState` → `toState`) |

---

## 1. Workflow engine

ERPNext-style state machine over a master's `state` column: named **states** +
**transitions** gated by **role** and an optional **condition**.

### 1.1 Attach a workflow to an entity
1. Define the workflow (UI: **Administration → Workflows**, or seed
   `seed-data/base/workflows/<slug>.json`). Shape:
   ```jsonc
   {
     "slug": "purchase-order",
     "appliesTo": "purchase-order",      // the master slug it governs
     "startState": "Draft",               // null state is treated as this
     "states": [
       { "name": "Draft", "color": "secondary" },
       { "name": "Pending Approval", "color": "warning" },
       { "name": "Approved", "color": "success" },
       { "name": "Rejected", "color": "danger" }
     ],
     "transitions": [
       { "action": "Submit",  "from": "Draft",            "to": "Pending Approval", "roles": ["admin"] },
       { "action": "Approve", "from": "Pending Approval", "to": "Approved", "roles": ["purchase-manager"],
         "condition": "doc.total <= 100000" },
       { "action": "Reject",  "from": "Pending Approval", "to": "Rejected", "roles": ["purchase-manager"] }
     ]
   }
   ```
2. Link the master to it: set `"workflowSlug": "<slug>"` on the master registry
   (in `seed-data/base/masters/<slug>.json`, then `npm run seed`). That's the one
   thing that makes a master "stateful".

**Configurator UI** (Administration → Workflows): edit states + transitions in two
tables (add/remove rows), pick the master it applies to, Save (→ custom scope) or
Reset to default.

### 1.2 Field reference
- **roles**: array of **role codes** (`roles` table `code`). Empty = any authenticated
  user. A user may perform a transition only if one of their active roles is listed.
- **condition**: a safe mini-expression over the record — `doc.<field> <op> <literal>`
  joined by `&&` (ops: `== != < <= > >=`). e.g. `doc.amount > 50000 && doc.branch == 'hq'`.
  Empty/omitted = always allowed. (No `eval`; unparseable conditions fail closed.)
- **state**: stored in `master_data.state`. A `null` state means the **start state**.

### 1.3 Runtime API (use this from the portal too)
- `GET /api/workflow/:masterSlug/:recordId/status`
  → `{ hasWorkflow, currentState, states[], actions[] }` — `actions` are the
  transitions **this user** may perform right now (role + condition filtered).
- `POST /api/workflow/:masterSlug/:recordId/transition` body `{ "action": "Submit" }`
  → applies it (re-checks state/role/condition), sets `state`, writes a timeline
  entry, and publishes `master.state_changed`.

Permissions: `workflow:view` (read), `workflow:transition` (act), `workflow:configure`
(edit definitions).

### 1.4 In the UI
The Record view automatically renders a **stepper** for the current state and an
**action bar** of available actions when the entity's master has a `workflowSlug`.
Nothing to wire per entity.

---

## 2. Communication engine (email templates)

Templates live as config resources (`email_template`); sending renders `{{variables}}`
and dispatches via the async worker.

### 2.1 Manage templates (UI: Administration → Email Templates)
- List shows every template with a **Default / Customised** badge.
- Editor: **WYSIWYG** body (Quill), subject, plain-text fallback, a **merge-tag
  inserter** for the declared `{{variables}}`, and a **live preview** with sample data.
- Save → writes the **custom** override; **Reset to default** removes it.

A template (seed `seed-data/base/email-templates/<slug>.json`):
```jsonc
{
  "slug": "po-approved",
  "subject": "{{appName}} — PO {{poNumber}} approved",
  "variables": ["appName", "poNumber", "approver"],
  "html": "<p>Hi,</p><p>PO {{poNumber}} was approved by {{approver}}.</p>",
  "text": "PO {{poNumber}} approved by {{approver}}"
}
```
**Variable contract:** every declared variable must be supplied at send time, and
every `{{placeholder}}` in the body must be declared — enforced server-side.

### 2.2 Send an email (from any module)
```ts
import { enqueueEmail } from '../queue/queues.js';
await enqueueEmail({ slug: 'po-approved', to: user.email,
  vars: { appName: env.app.name, poNumber: '...', approver: '...' } });
```
This returns instantly; the **worker** renders + sends (Mailhog in dev at
:8025). API: `GET/PUT/DELETE /api/templates[/:slug]` (`communication:template.read|update`).

### 2.3 Triggering email from events (design — next increment)
A `email_trigger` config resource maps an event to a template + recipients, matched
by the worker:
```jsonc
{ "slug": "po-approved", "on": { "event": "master.state_changed",
  "masterSlug": "purchase-order", "toState": "Approved" },
  "template": "po-approved", "to": ["role:purchase-manager", "{{doc.requestedBy}}"] }
```
The worker's `events` consumer is the seam where this matcher attaches (it already
receives `master.state_changed`).

---

## 3. Assignment engine (design — upcoming)

Auto-assign a record to a user when an event matches a rule. Stored as an
`assignment_rule` config resource; executed by the worker on events.
```jsonc
{ "slug": "po-approvers", "appliesTo": "purchase-order",
  "applyOn": { "event": "master.state_changed", "toState": "Pending Approval" },
  "assignTo": { "type": "role", "value": "purchase-manager" },
  "rule": "round_robin",            // round_robin | load_balancing | by_field
  "notify": { "template": "po-assigned" } }
```
Planned pieces: an `assignments` table, a service (candidate selection by role +
round-robin / least-loaded), a worker handler on events, a **configurator UI**
(rules table, reusing the dynamic-form engine like Workflows), and a **"My
assignments" worklist**. Full design in
[PLAN-workflow-assignment-communication.md](./PLAN-workflow-assignment-communication.md).

---

## 4. Activity (timeline + comments) — free with every entity

Any record gets a real **timeline** + **comments** with no per-entity work:
- Timeline auto-records `created` / `updated` / `state_changed` / `commented`.
- API: `GET /api/activity/:entityType/:recordId/timeline`,
  `GET/POST /api/activity/:entityType/:recordId/comments` (`activity:view|comment`).
- The Record view renders both and lets users post comments.
- Other engines call `activityService.addTimeline(entityType, recordId, kind, summary, actorUserId)`.

---

## 5. Recipe — wire all of this into a NEW entity

1. **Seed the master + form** (`seed-data/base/masters/<slug>.json` +
   `forms/<formSlug>.json`), `npm run seed`. → List + Record screens generate
   automatically; activity + comments work out of the box.
2. **(optional) Surface it in a module** — add `'<module>/<sub>': { masterSlug: '<slug>' }`
   to `BACKED_VIEWS` (frontend) so it appears under that module; otherwise it's
   reachable via **Administration → Masters**.
3. **(optional) Add a workflow** — define it (UI/seed) and set `workflowSlug` on the
   master. → Stepper + actions appear on the Record view.
4. **(optional) Email** — create templates in the UI; send via `enqueueEmail(...)`
   (and, once shipped, an `email_trigger` to fire on events).
5. **(optional) Assignment** — define an `assignment_rule` (once the engine ships).

## 6. Using the engines from an external portal

Everything is a permissioned REST API behind the same auth (JWT access token +
refresh cookie). A portal authenticates, then calls:
`/api/masters/...` (data), `/api/workflow/...` (state + transitions),
`/api/activity/...` (timeline/comments), `/api/templates/...` (templates). The
engines are UI-agnostic — the Angular app is just one consumer.
