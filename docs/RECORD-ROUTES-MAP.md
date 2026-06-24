# Record routes — the clean mental split

A *record* (a Purchase Order, a Requisition, an Invoice…) is touched by **four
different API surfaces**, and each one answers a different question. They are
deliberately kept separate so each can evolve on its own. Read the table first,
then the per-route notes.

## The clean mental split

| Concern | Route | Axis | Drives (in the UI) |
| --- | --- | --- | --- |
| **Record fields** — the *data* on the record | `/api/masters/:slug/data` | — (the record itself) | The form + the record **list** |
| **Record lifecycle** — the *state* it's in | `/api/workflow/:slug/:id/{status,transition}` | **Vertical** (it moves up its own ladder: Draft → Submitted → Approved) | The status **stepper** + **action buttons** |
| **Record relationships** — its *lineage* | `/api/documents/:master/:code/{links,create-next}` | **Horizontal** (it spawns sibling docs: Requisition → PO → Invoice) | The **Related documents** panel + **"Create next"** |
| **Authoring the workflow** — *designing* the ladder | `/api/workflow-defs/:slug` | Config / design-time | The **Admin → Workflows** rule-builder |

### How to read the axes

```
            Authoring (design-time)
            ── /api/workflow-defs ──
                      │ defines the ladder
                      ▼
   Requisition ──────────────► PO ──────────────► Invoice     ← HORIZONTAL
   (/api/documents …/create-next spawns the next doc)           lineage
        │                       │                    │
        ▼ VERTICAL              ▼                     ▼
     Draft                   Draft                 Draft
     Submitted               Submitted             Submitted     ← each doc climbs
     Approved                Approved              Approved          its OWN ladder
   (/api/workflow …/transition moves it up)                       (/api/workflow)

   Underneath all of it, the row's actual fields live at
   /api/masters/:slug/data  (the data plane).
```

- **Vertical** = one record moving through *its own* states. Nothing new is
  created; the same row changes `state`.
- **Horizontal** = one record giving birth to *a different* record in another
  master. A new row is created and an edge is recorded between them.

---

## 1. Record fields — `/api/masters/:slug/data`

The **data plane**. CRUD over the record's own fields.

- `GET  /api/masters/:slug/data` → rows for the **list view**.
- `GET  /api/masters/:slug/data/:id` → one record for the **form**.
- `POST/PATCH/DELETE` → create / edit / remove.

Backing store is transparent: `master_registry.kind` decides whether the row
lives in the generic `master_data` JSONB table (`kind: 'master'`) or in a
dedicated relational table (`kind: 'document'`). The frontend never knows which.

This route knows nothing about *state* or *lineage* — it's just fields in, fields
out.

## 2. Record lifecycle — `/api/workflow/:slug/:id/{status,transition}`

The **vertical** axis: the record climbing its own ladder.

- `GET  …/status` → current `state` + the transitions available *to this user*
  (role-gated). Drives the **stepper** and which **action buttons** are enabled.
- `POST …/transition` → fire an action (`Submit`, `Approve`…). The rule engine
  evaluates `if/else-if/else` branches and runs the resulting actions
  (`set_state` / `set_field` / `assign` / `email`), then persists the new state.

The record is identified by `:id`; the *shape* of the ladder comes from the
workflow definition (route #4). Store-agnostic — works the same for a JSONB
master or a document table.

## 3. Record relationships — `/api/documents/:master/:code/{links,create-next}`

The **horizontal** axis: lineage between *different* records (SAP VBFA-style).

- `GET  …/links` → the lineage edges from `document_links`
  (`from_master/from_code → to_master/to_code`, with a `relation`). Drives the
  **Related documents** panel.
- `POST …/create-next` → look up the next step in the `document_pipeline` config,
  load the source row, **map** its fields (incl. line-items) onto a fresh draft
  in the target master, save a `document_links` edge, and timeline both sides.
  Drives the **"Create next"** button (e.g. PO → Purchase Invoice).

The new draft gets its **own** code (naming series) and starts at the **bottom**
of its **own** workflow ladder — that's the hand-off from horizontal back to
vertical.

## 4. Authoring the workflow — `/api/workflow-defs/:slug`

**Design-time.** This is where you *build* the ladder that route #2 later walks.

- `GET/PUT /api/workflow-defs/:slug` → read/save the workflow definition
  (states + rules: trigger action, `fromState`, allowed roles, branches,
  actions). Drives the **Admin → Workflows** rule-builder UI.

Config-driven via `config_resources` (base + custom, deep-merged — custom wins
and survives re-seed). Changing the definition here changes what
`/api/workflow/…/transition` will do for *every* record of that type.

---

### One-line summary

> **`/masters/data`** = what the record *is* ·
> **`/workflow`** = what *state* it's in (vertical) ·
> **`/documents`** = what it's *related to* (horizontal) ·
> **`/workflow-defs`** = how the ladder is *designed*.
