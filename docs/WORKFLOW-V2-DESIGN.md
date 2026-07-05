# Workflow Engine v2 — Design & Migration Plan

> Status: **design — approved direction, not yet built.** Translates the industry
> research (`compass_artifact … workflow configurators`) into *this* codebase.
> Supersedes the ad-hoc rule engine, the bespoke `approval_matrix`, and the
> hard-coded condition comparisons.

## Decisions locked (this round)
1. **Hybrid storage** — author definitions in `config_resources` (keep base→override
   white-label merge + the existing editor); on **publish**, snapshot the *resolved*
   definition into an **immutable version**; instances pin to it.
2. **Instance pinning from day one** — every document stamps the workflow version it
   started on; edits create a new version and never change in-flight documents.
   (Avoids the ERPNext live-edit trap — the single hardest thing to retrofit.)
3. **Phase-1 approvals = serial multi-step**, approvers by role / user / matrix, with
   a "My Approvals" inbox. Defer parallel/voting, delegation, escalation/SLA, the
   visual (bpmn-js) designer, and in-flight migration.
4. **JSONLogic** for all stored conditions — safe, serializable, evaluated identically
   in Node (enforce) and Angular (preview). Never `eval`.

---

## 1. Why v2 (the problem with v1)

The current engine merges three concerns into one JSONB rule and compares fields to
**hard-coded literals** (`vendor == "Acme"`). It doesn't version-pin instances, and
"approval" is a single `assign` action. As scenarios get complex (amount tiers,
location, multi-step sign-off) this doesn't absorb change — every new case needs new
code. The research's answer (and yours) is to make the engine know only about
**attributes**, and express everything — conditions *and* routing — over them.

The research converges on a **two-layer, in-process** design (ERPNext/NetSuite/SAP
Flexible Workflow/Oracle AME all do this), which is exactly what we'll build.

---

## 2. Target architecture — two layers

```
   DOCUMENT (PO, PI, …)  ──created──►  WORKFLOW INSTANCE  ──pinned──►  WORKFLOW VERSION (immutable)
                                              │  current_state, status
        user action (Submit / Approve …)      │
                                              ▼
   ┌──────────────────────────────────────────────────────────┐
   │  LAYER 1 — LIFECYCLE FSM                                   │
   │  states + transitions + guards (JSONLogic over attributes)│
   │  "which state can go where, who may act, under what cond" │
   └───────────────┬──────────────────────────────────────────┘
                   │ a transition may `requiresApproval`
                   ▼
   ┌──────────────────────────────────────────────────────────┐
   │  LAYER 2 — APPROVAL SUB-ENGINE (Oracle AME model)         │
   │  attributes → JSONLogic rules → ordered approver STEPS    │
   │  materialises APPROVAL_TASKS (the inbox); serial advance  │
   └───────────────┬──────────────────────────────────────────┘
                   │ chain clears
                   ▼
   execute transition in ONE db txn: set state · on-entry actions
   (ledger post w/ idempotency) · append WORKFLOW_HISTORY · emit event
```

Layer 1 decides **when**; Layer 2 decides **who signs off**; domain services decide
**what** (ledger, notifications). Keep orchestration in the engine, heavy logic in
services (the NetSuite/SuiteScript split).

---

## 3. The attribute registry (your idea, = Oracle AME "Attributes")

Attributes are the **only** variables the engine knows. Conditions and approver rules
are written over them; the admin UI autocompletes them (your `@` picker).

**Sources (assembled into an evaluation context per document + acting user):**
| namespace | comes from | examples |
|---|---|---|
| `doc.*` | the entity's **form fields** (typed) — auto-registered | `doc.amount`, `doc.branch`, `doc.vendor`, `doc.grandTotal` |
| `user.*` | the acting user | `user.roles`, `user.branch` |
| `system.*` | runtime | `system.today` |
| `lookup.*` | a **master-linked / collated** value (this is your "master link + collation link") | `lookup.approvalLimit` = approval master keyed by `(user.role, doc.branch)` |

An attribute definition:
```jsonc
{ "key": "approvalLimit", "label": "Approval limit", "type": "number",
  "source": "lookup",
  "lookup": { "master": "approval-matrix", "keyFields": ["role", "branch"] } }
```
- **`doc.*` auto-derives from the form** (every field is an attribute, with its type)
  → no duplicate registry to maintain; add a form field, it's usable in rules.
- **`lookup.*`** is where "collation linking" lives: the master to read + the keys to
  correlate on. This is how the approval limit (or vendor payment terms, etc.) enter
  conditions without bespoke code.
- Registry scope: **per entity** = its form fields + the shared `user`/`system`/config
  `lookup` attributes.

---

## 4. Conditions — JSONLogic over attributes

Stored as JSONLogic; evaluated against the attribute context. Field-vs-field and
field-vs-lookup fall out naturally (your "not always a hard-coded value"):
```jsonc
// amount exceeds the approver's matrix limit
{ ">": [ { "var": "doc.amount" }, { "var": "lookup.approvalLimit" } ] }
// accepted <= ordered  (two doc fields)
{ "<=": [ { "var": "doc.acceptedQty" }, { "var": "doc.orderedQty" } ] }
```
- **Safe** (no `eval`), **portable** (same lib in Angular for live preview + Node for
  enforcement), **serializable** (stores in the versioned definition).
- The admin UI renders JSONLogic as friendly rows (attribute → operator → value|@attr)
  and can offer a raw view; the `@` autocomplete is driven by the attribute registry.
- Replaces `condition.ts` (`{field,op,value}`) — that shape becomes a UI convenience
  that compiles to JSONLogic.

---

## 5. Approval sub-engine (AME) — how the "matrix" really works

The bespoke `role×branch→limit` table is **replaced** by AME-style rules, which is
more general and matches your "matrix didn't fit" instinct:

- **Approval rule** = a JSONLogic **condition** (amount tier, category, branch…) → an
  ordered list of **approver steps**.
- **Approver step** = how to resolve who signs: `role` (users with a role, scoped to
  `doc.branch`), `user` (named), `matrix`/`query` (a lookup), later `manager`.
- **Serial** advance in Phase 1: step 1 approves → step 2 becomes active → … → chain
  clears → transition executes.

The old `admin@DEL=100000 / admin@MUM=20000` matrix becomes **tiered rules**:
```jsonc
"approvalRules": [
  { "when": { "<=": [ {"var":"doc.amount"}, 50000 ] },
    "steps": [ { "approver": "role", "role": "manager", "branchScoped": true } ] },
  { "when": { ">":  [ {"var":"doc.amount"}, 50000 ] },
    "steps": [ { "approver": "role", "role": "manager",  "branchScoped": true },
               { "approver": "role", "role": "director", "branchScoped": true } ] }
]
```
Branch/location scoping = the step resolves approvers **in the document's branch**.
Amount-vs-limit = the tier boundaries (the matrix limits become rule conditions).

---

## 6. Storage (hybrid) & data model

**Authoring (config, unchanged philosophy):** `config_resources` holds the editable
workflow (`states`, `transitions`, `attributes`, `approvalRules`) with base→override
merge. The workflow-editor UI edits this. **Nothing here is executed directly.**

**Publish → immutable version:** on publish, resolve (base+override) and freeze into:
- `workflow_version` (id, workflow_key, entity_type, version_no, status
  [draft/published/retired], **definition_json** (frozen), created_at) — *immutable*.

**Runtime (relational):**
- `workflow_instance` (id, entity_type, record_id, **workflow_version_id** [PIN],
  current_state, status, branch_id, created_at, updated_at) — one per document; the
  authoritative state. The doc's own `state` column becomes a denormalised cache for
  list views.
- `approval_task` (id, instance_id, rule_id, step_no, approver_user_id, status
  [pending/approved/rejected/skipped], acted_by, acted_at, comment) — the
  **"My Approvals" inbox**; evolves from today's `assignments`.
- `workflow_history` (id, instance_id, from_state, to_state, action, actor, at,
  payload) — append-only; can reuse the activity timeline or a dedicated table.

Conditions live **inline as JSONLogic** in `definition_json` (no separate table needed
at our scale).

---

## 7. Execution model

On a user action: (1) load the instance + its **pinned** version; (2) find the
transition; (3) check role + evaluate the JSONLogic guard against the attribute
context; (4) if `requiresApproval`, evaluate approval rules → materialise
`approval_task`s, hold in a pending sub-state until the serial chain clears;
(5) on clearance, run the transition in **one DB transaction** — set state, run
on-entry actions (ledger post with an **idempotency key**), append `workflow_history`,
emit `workflow.transitioned`. Use `SELECT … FOR UPDATE` on the instance row (or an
optimistic `row_version`) to prevent double-transition races; make ledger posting
idempotent.

---

## 8. Migration — what happens to v1 and this session's work

Nothing is thrown away; it **refactors into v2**:

| v1 today | → v2 |
|---|---|
| `state` on doc table | `workflow_instance.current_state` (+ version pin); doc `state` = cache |
| merged rules + `set_state` | Layer-1 transitions + guards (JSONLogic) |
| single `assign` action + bespoke `byLimit` matrix | Layer-2 approval rules → steps → `approval_task` |
| `assignments` table + service + worklist | `approval_task` + the same "My Work"/inbox UI |
| gating (`editable`/`requiresAssignee`/`canCreateNext`) | transition guards + instance-state checks (kept) |
| `condition.ts` `{field,op,value}` | JSONLogic evaluator (UI still shows rows) |
| **this session:** `branch` master, `user.branch` | **kept** — feed the attribute registry |
| **this session:** `approval_matrix` config + `matrixCandidates` | **reworked** into tiered approval rules / a `lookup` attribute (the uncommitted matrix code is a starting point, not the final shape) |

The uncommitted `branch`/`user.branch`/`approval-matrix` code on this branch: keep the
branch + user.branch foundations; **rework** the matrix schema/routing into rules.

---

## 9. Phase plan

- **Phase 1 (this build):** versioning + instance pinning · attribute registry (form
  + user/system + lookup) · JSONLogic conditions · serial multi-step approval sub-engine
  · `approval_task` inbox · append-only history · idempotent transition txn · admin UI
  extended (attributes, JSONLogic condition rows, approval rules) · "My Approvals" screen.
- **Phase 2:** visual designer (bpmn-js or Sequential Workflow Designer, both MIT),
  read-only flow diagram for end users, richer rule builder.
- **Phase 3:** parallel approvals + "all of / one of" voting · delegation & ad-hoc
  approvers · timers/escalation/SLA (a scheduled worker over overdue tasks) · reviewers
  · in-flight instance migration (map old state-keys → new).

---

## 10. Build sequence for Phase 1

1. **Versioning + pinning foundation.** `workflow_version` (publish snapshot) +
   `workflow_instance` tables; create/pin an instance when a doc enters the workflow;
   route all reads/transitions through the pinned version. Migrate current doc `state`
   into instances.
2. **Attribute registry + JSONLogic.** Auto-derive `doc.*` from the form; add
   `user.*`/`system.*`; a `lookup` resolver (master + collation keys). Swap `condition.ts`
   for a JSONLogic evaluator; assemble the attribute context.
3. **Approval sub-engine.** `approval_task` (refactor `assignments`); evaluate approval
   rules → serial steps; materialise/advance tasks; close/complete on clearance.
   Rework the matrix into tiered rules.
4. **Wire Layer-1 ↔ Layer-2.** `requiresApproval` transitions hold pending until the
   chain clears, then execute the transition txn (state + ledger hook + history).
5. **Admin UI + inbox.** Extend the workflow-editor for attributes / JSONLogic
   condition rows / approval rules; build the "My Approvals" inbox (reuse "My Work").
6. **Migrate & verify.** Port the PO workflow to v2; demo end-to-end
   (amount-tiered, branch-scoped, serial approval) via UI + API.

---

## 11. Open decisions to confirm before building Phase 1

1. **State source of truth:** move workflow state fully into `workflow_instance`
   (doc `state` becomes a cache), or keep both in sync? (Recommend: instance is
   authoritative, doc column cached for list views.)
2. **JSONLogic library:** `json-logic-js` (canonical, tiny) vs `json-rules-engine`
   (facts/events, async) — recommend `json-logic-js` for conditions; keep async
   lookups outside JSONLogic (resolve `lookup.*` into the context first).
3. **Approver step resolution when none qualifies** (e.g. amount over every tier /
   no user in branch): block with a clear error, or escalate to a fallback approver?
4. **"My Approvals" vs "My Work":** one inbox (tasks + assignments unified) or two?
5. **Does entering the workflow = document creation, or an explicit "Submit"?** (When
   is the instance created + pinned?)
6. **Backfill:** existing in-flight docs (PO-2026-000x) — pin them to the first
   published v2 version, or leave them on v1 until closed?
