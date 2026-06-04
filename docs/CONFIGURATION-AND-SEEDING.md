# Configuration & Seeding

How this ERP is configured and how base/client data is seeded. The guiding
principle (from the implementation doc): **everything that varies per client is
configuration, not code.**

- [1. Configuration layers](#1-configuration-layers)
- [2. Deployment config: JSON → .env](#2-deployment-config-json--env)
- [3. The config-resolution pipeline (base → override → effective)](#3-the-config-resolution-pipeline)
- [4. Seeding (file-based)](#4-seeding-file-based)
- [5. Client-specific overrides](#5-client-specific-overrides)
- [6. Adding things — recipes](#6-adding-things--recipes)
- [7. Command reference](#7-command-reference)

---

## 1. Configuration layers

There are three independent layers (per §3.2 of the implementation doc):

| Layer | Question it answers | Where it lives |
|---|---|---|
| **1. Module enablement** | Which modules/features does this deployment run? | `config.<env>.json → modules` → `MODULE_*` env vars |
| **2. Resource config** | How is each form / master / email shaped for this client? | `config_resources` table (base + override), seeded from files |
| **3. ACL** | Within an enabled module, who can do what? | `roles`, `permissions`, `role_permissions`, `user_roles` |

Layers 1 is plain deployment config (§2). Layers 2 and 3 are seeded from
[`backend/seed-data/`](../backend/seed-data/) (§4) and are resolvable/overridable.

---

## 2. Deployment config: JSON → .env

**The JSON files in [`config/`](../config/) are the single source of truth for
deployment configuration** — including secrets (per project decision). They are
validated by [`config/schema.ts`](../config/schema.ts) (Zod) and flattened into
`backend/.env` by [`scripts/gen-env.ts`](../scripts/gen-env.ts).

```
config/config.<env>.json  ──gen-env──►  backend/.env  ──env.ts──►  typed env object
   (you edit this)          (generated)    (never edit)     (validated at boot)
```

- **Never hand-edit `backend/.env`** — change the JSON and run `npm run gen:env -- <env>`.
- Real `config.*.json` files are **git-ignored**; only `*.example.json` templates are committed.
- The backend re-validates the resulting env at startup ([`backend/src/config/env.ts`](../backend/src/config/env.ts)), so a misconfiguration fails fast with a clear message.

### Config sections

| Section | Purpose |
|---|---|
| `app` | name, env, port, log level, public URL |
| `database` | Postgres connection (host/port/user/password/name/ssl) |
| `redis` | Redis connection |
| `auth` | token TTLs + secrets, session timeouts, cookie settings, concurrent-session policy |
| `smtp` | mail transport (host/port/user/password/from) |
| `admin` | first-admin bootstrap (username, email, displayName) |
| `clientSlug` | **which client's overrides this deployment applies** (see §5) |
| `modules` | Layer-1 feature toggles → `MODULE_<NAME>=true|false` |

To add a config setting: add it to `config/schema.ts`, the `*.example.json`, the
`FLATTEN` map in `gen-env.ts`, and the env schema in `backend/src/config/env.ts`.

---

## 3. The config-resolution pipeline

Forms, email templates, master schemas, and workflows are all **configurable
resources** served by one generic resolver (§3.4). They live in a single
`config_resources` table, distinguished by a `resource_type` column, with two
scopes:

- **`base`** — shipped product defaults (seeded, treated as read-only baseline).
- **`custom`** — this client's customizations (overrides).

```
resolve(resourceType, slug):
  cache hit?  ── yes ─► return cached
       │ no
       ▼
  base     = row(resourceType, slug, scope=base)
  override = row(resourceType, slug, scope=custom)
  effective = deepMerge(base, override)     # override wins, field-by-field
  validate(effective)                       # Zod schema for that resource type
  cache effective (Redis, TTL)
  return effective
```

Key properties:

- **Override wins field-by-field.** Arrays merge **by an identity key**, not by
  index — e.g. a form's `fields` merge by `key`, a field's `options` by `value`.
  So an override only states what it changes.
- **Versioned.** Each row has a `version` that bumps on edit; in-flight documents
  can pin to the version they were created with.
- **Cached with stampede protection** (cache-aside + SETNX lock); invalidated on
  write (`cfg:<type>:<slug>` key dropped).
- **Falls back to base** when no override exists.

### Merge semantics (what an override can do to an array-by-key)

For a form whose base `fields` are `[sku, name, uom]`:

| Override intent | Override file contains | Effective result |
|---|---|---|
| **Add** a field | `{ "key": "type", … }` | `[sku, name, uom, type]` (appended) |
| **Modify** a field | `{ "key": "uom", "label": "UoM" }` | `uom`'s label patched, rest kept |
| **Remove** a field | `{ "key": "uom", "__deleted": true }` | `[sku, name]` (tombstoned) |

Everything not mentioned is inherited from base. **Base and override are stored
separately**, so a product upgrade can re-seed `base/` (e.g. add a `barcode`
field) and the client still keeps `type` *and* gains `barcode`.

---

## 4. Seeding (file-based)

Base and client data live as JSON files under
[`backend/seed-data/`](../backend/seed-data/) — **data, not code**. `npm run seed`
discovers the files, validates them (Zod), and upserts. Every seeder is
**idempotent**: re-running re-applies shipped defaults without disturbing client
overrides, and resource versions bump only when content actually changes.

```
backend/seed-data/
├── base/                              # shipped defaults  (scope = base)
│   ├── permissions/<module>.json
│   ├── roles/<code>.json
│   ├── masters/<slug>.json
│   ├── forms/<slug>.json
│   └── email-templates/<slug>.json
└── clients/<clientSlug>/              # this deployment's client  (scope = custom)
    ├── forms/<slug>.json
    ├── email-templates/<slug>.json
    └── masters/<slug>.json
```

Seeders run in dependency order: **permissions → roles → masters → forms →
email-templates → admin-bootstrap** (admin bootstrap sends a welcome email, so its
template must already be seeded).

### File formats

**`permissions/<module>.json`** — capabilities for one module:
```json
{
  "module": "permission",
  "permissions": [
    { "action": "role.read",   "description": "View roles and assignments" },
    { "action": "role.create", "description": "Create roles" }
  ]
}
```

**`roles/<code>.json`** — a role + its grants. `permissions` is `"all"`, an array
of exact `module:action` keys, or glob patterns (`*` matches a segment):
```json
{ "code": "admin",  "name": "Administrator", "isSystem": true, "permissions": "all" }
{ "code": "viewer", "name": "Viewer", "isSystem": true, "permissions": ["*:*.read", "*:view"] }
```
> Convention: `*:view` = screen/route access, `*:*.read` = read actions. This is
> how route-level vs in-screen action permissions are expressed (see ACL docs).

**`masters/<slug>.json`** — a master registry entry (+ seeded rows in `data`):
```json
{
  "slug": "country", "name": "Country",
  "managedBy": "seeded", "editable": false,
  "data": [ { "code": "IN", "name": "India" }, { "code": "US", "name": "United States" } ]
}
```
`managedBy: "seeded"` = read-only reference data; `managedBy: "ui"` = full CRUD,
with `formSlug` pointing at the form that edits it.

**`forms/<slug>.json`** — a full form definition (validated against the form schema):
```json
{
  "slug": "master-item", "version": 1, "title": "Item", "layout": "two-column",
  "fields": [
    { "key": "sku",  "type": "text", "label": "SKU",  "required": true },
    { "key": "name", "type": "text", "label": "Name", "required": true },
    { "key": "uom",  "type": "master-lookup", "label": "Unit of Measure", "optionsSource": { "master": "uom" } }
  ]
}
```

**`email-templates/<slug>.json`** — subject/body with a declared variable contract:
```json
{
  "slug": "welcome",
  "subject": "Welcome to {{appName}} — set your password",
  "variables": ["appName", "userName", "link", "expiryHours"],
  "html": "<p>Hi {{userName}}, …<a href=\"{{link}}\">Set your password</a></p>"
}
```

---

## 5. Client-specific overrides

### How the deployment knows its client

It's declared at deploy time — there is no runtime client resolution (single
deployment per client):

```
config.<env>.json → "clientSlug": "acme"
      │ gen-env
      ▼
backend/.env → CLIENT_SLUG=acme
      │ env.ts
      ▼
env.clientSlug = "acme"  →  seeder reads seed-data/clients/acme/…
```

If `clientSlug` is unset, only `base/` is seeded.

### What override files do

A client file is seeded as **`scope=custom`** and merged onto the base via the
resolver (§3). For forms/email-templates the override is a **partial** definition
— it lists only what changes; everything else is inherited from base.

**Example** — base `master-item` has `sku, name, uom`. The client wants a 4th
field `type`. The client file contains only:
```json
{ "slug": "master-item", "fields": [ { "key": "type", "type": "select", "label": "Type" } ] }
```
The resolved (effective) form for that deployment is `[sku, name, uom, type]` —
4 fields. The base 3 are not restated, and a later base upgrade still flows through.

> Permissions/roles are normally base-only, but a client folder *can* add roles or
> permissions; they're upserted just like base.

---

## 6. Adding things — recipes

| I want to… | Do this |
|---|---|
| Add a permission | Add an entry to `seed-data/base/permissions/<module>.json`, reference it in a `requirePermission()` guard, run `npm run seed` |
| Add/seed a role | Add `seed-data/base/roles/<code>.json` with its `permissions` spec, run seed |
| Add a master | Add `seed-data/base/masters/<slug>.json` (+ a `forms/<formSlug>.json` if UI-managed), run seed |
| Add/ship a form | Add `seed-data/base/forms/<slug>.json`, run seed |
| Add an email template | Add `seed-data/base/email-templates/<slug>.json`, run seed |
| Customize any of the above for a client | Add the partial file under `seed-data/clients/<clientSlug>/…`, set `clientSlug` in config, run seed |
| Add a deployment config setting | Edit `config/schema.ts`, `*.example.json`, `gen-env.ts`, `backend/src/config/env.ts`; run `gen:env` |

---

## 7. Command reference

```bash
npm run gen:env -- <env>     # regenerate backend/.env from config/config.<env>.json
npm run db:up                # start Postgres + Redis + Mailhog (dev)
npm run migration:run        # apply schema migrations
npm run seed                 # seed base data (+ active client overrides) — idempotent
```

Seeding reads the active client from `config.<env>.json → clientSlug`. To seed a
different client locally without editing config, override the env var:
`CLIENT_SLUG=acme npm run seed`.
