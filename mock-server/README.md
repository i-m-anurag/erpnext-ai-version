# Collatio Mock Server

A tiny Express server that mimics the real Collatio API so the ERPNext UI can be
developed/demoed without the live backend.

## Endpoints

| Method | Path | Purpose | Body |
|---|---|---|---|
| POST | `/collatio/validate-and-reconcile` | Three-way-match result | JSON (ignored) |
| POST | `/collatio/upload-and-download` | Queue a document for OCR | multipart: `file`, `clientName`, `appName`, `documentType` |
| GET  | `/health` | Liveness check | — |

Responses live in [`responses/`](./responses) as plain JSON — edit them to change
what the UI sees. The `upload-and-download` `documentId` is generated fresh per
request so each upload looks unique.

## Run

```bash
cd apps/ai_procurement/mock-server
npm install
npm start            # listens on :8000 by default (matches the provided curl)
```

### Config (env vars)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8000` | listen port |
| `MOCK_LATENCY_MS` | `600` | simulated processing delay |

> On a Mac dev bench ERPNext already uses `:8000`, so run the mock on another
> port, e.g. `PORT=5005 npm start`, and point ERPNext at it (below).

## Point ERPNext at this server

ERPNext calls the API **server-side** (no browser CORS) using the URL in
`site_config.json` key **`collatio_api_url`**:

```bash
# local bench
bench --site erp.localhost set-config collatio_api_url "http://localhost:5005"

# (optional) override the upload form constants
bench --site erp.localhost set-config collatio_client_name "ScryAPI"
bench --site erp.localhost set-config collatio_app_name "ERPSystems_7811"
```

In Docker, set the `COLLATIO_API_URL` env var (the entrypoint writes it into the
site config on boot).

- **Three-Way Match** button (Purchase Invoice) → `POST /collatio/validate-and-reconcile`
- **Purchase Requisition with Collatio** button (Material Request) → `POST /collatio/upload-and-download`

If `collatio_api_url` is **not** set, the Three-Way Match button falls back to the
built-in local link-traversal computation.

## Quick test

```bash
curl -s -X POST http://localhost:5005/collatio/validate-and-reconcile | jq .header.overall_result

curl -s -X POST http://localhost:5005/collatio/upload-and-download \
  -F 'file=@/path/to/any.pdf' -F 'clientName=ScryAPI' \
  -F 'appName=ERPSystems_7811' -F 'documentType=Purchase Requisition' | jq .
```
