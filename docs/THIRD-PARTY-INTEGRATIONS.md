# Third-party API integrations (Collatio)

The ERP talks to external services through a single, logged HTTP gateway. The
first consumer is **Collatio** (an AI document & email parser): documents are
uploaded for OCR, and invoices are reconciled via a three-way match.

## The gateway (reusable core)

- **`HttpGatewayService`** (`backend/src/modules/integration/http-gateway.service.ts`)
  wraps `axios`. Every call goes through `request()`, which writes one
  `api_call_log` row per attempt — success, non-2xx, or transport error — with
  secret headers redacted and bodies capped. `recordMock()` logs a canned dev
  response the same way. **New integrations must call the gateway, never axios
  directly**, so nothing leaves the ERP unlogged.
- **`api_call_log`** table (migration `1782600000000-ApiCallLog`): provider,
  operation, method, url, request/response (capped), status, ok, durationMs,
  error, `mock`, correlationId, entity, actorUserId.
- **Admin → Integrations** (`/app/m/admin/integrations`, perm `integration:log.read`)
  lists the calls (scrollable, newest first) with a request/response detail drawer.
- **Log controls** (`integrations.logs` in config):
  - `uiEnabled` — show/hide the Admin logs page (nav entry hidden + route guarded
    when off; surfaced via `/api/meta` → `IntegrationSettingsService`).
  - `archiveEnabled` + `retentionDays` — the worker moves entries older than
    `retentionDays` from `api_call_log` into `api_call_log_archive` (on startup,
    then daily), keeping the live table small.

## Config

Deployment config (`config/config.<env>.json` → gen-env → `env.integrations.collatio`):

```json
"integrations": { "collatio": { "ocrBaseUrl": "http://10.1.0.28:8090", "clientName": "erp", "mock": true } }
```

`mock: true` (or an empty `ocrBaseUrl`) returns canned responses without hitting
the service — used in dev (the real API needs VPN access). Secrets stay in
runtime config, never in the image.

Per-form enablement is the `integration_config` resource, keyed by form slug
(`backend/seed-data/base/integration-config/<slug>.json`):

```json
{ "slug": "requisition",       "collatioUpload": { "enabled": true, "docType": "requision" } }
{ "slug": "purchase-invoice",  "threeWayMatch":  { "enabled": true } }
```

## Feature 1 — Create a record from a document upload

1. On a list whose slug has `collatioUpload.enabled`, **"Create using Collatio"**
   opens a file picker (`CollatioUploadModalComponent`).
2. `POST /api/integrations/collatio/upload` (multipart) stores the file at
   `assets/manual_upload/<slug>/<transactionId>/<filename>` (repo root,
   git-ignored), calls Collatio `POST /collatio/upload`, and creates a **draft**
   record stamped with `collatioDocId`, `collatioTransactionId`, and
   `collatioFilePath` (the last two in the doc's `extra` jsonb).
3. The **requisition form controller** derives the state **"Extraction in
   progress"** for a Collatio-sourced draft.
4. The record view shows a **Document reconciliation** deep-link card (from
   `collatioDocId`) and an **Uploaded document** card that streams the stored
   file via `GET /api/integrations/collatio/document/:slug/:code`.

## Feature 2 — Three-way match on an invoice

On a **submitted** invoice whose slug has `threeWayMatch.enabled`, the
**"Three-way match"** action calls `POST /api/integrations/collatio/three-way-match`,
which resolves the invoice's linked MR/PO/PR (via document links; sample codes
in mock) and calls Collatio `POST /collatio/validate-and-reconcile`. The result
renders in an interactive popup (`ThreeWayMatchModalComponent`): verdict banner,
per-line qty/price checks, totals, tolerances, control checks, and the
outstanding amount / next action — so AP can judge the match before payment.

## Adding another integration

1. Add config under `env.integrations.*`.
2. Write a client that calls `httpGateway.request(...)` (and `recordMock` for a
   dev path).
3. Expose endpoints on the integration router; gate per-form behaviour with an
   `integration_config` entry if it's form-scoped.
