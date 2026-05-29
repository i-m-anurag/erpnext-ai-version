# AI Procurement

A custom [Frappe](https://frappeframework.com/)/[ERPNext](https://erpnext.com/) app that
integrates an AI-based OCR engine into the procurement lifecycle. The first stage
implemented is **PO OCR validation** — letting a buyer upload a physical Purchase Order,
extract its contents via OCR, and validate the items & quantities against the originating
**Material Request**.

> **Status:** OCR is currently **mocked** for end-to-end development. The mock is isolated in
> a single function so the real OCR engine can be wired in without touching the UI or workflow.

---

## Features

### PO OCR — Validate a physical PO against a Material Request

On any **submitted Material Request**, a new **PO OCR** option appears in the **Create**
dropdown (alongside *Purchase Order*, *Request for Quotation*, *Supplier Quotation*).

The flow:

1. Click **Create → PO OCR**. A popup opens, pre-bound to the current Material Request.
2. Upload the physical PO document (PDF / JPG / PNG).
3. A loader runs while the OCR engine reads the document.
4. The extracted data and an **item-by-item comparison table** render in the same popup:
   - 🟢 **Matched** — item & quantity match the request
   - 🟠 **Qty Mismatch** — item matches but the quantity differs
   - 🔴 **Not in Request** — item on the PO that was never requested
   - 🔴 **Missing from PO** — requested item absent from the PO
5. Click **Save Validation** to persist an audit record (**PO OCR Validation**) containing the
   uploaded file, OCR output, and the full comparison.

---

## DocTypes

| DocType | Type | Purpose |
|---------|------|---------|
| **PO OCR Validation** | Master | Audit record of one validation run. Links to the Material Request, stores the uploaded file, OCR-extracted header data, the match summary, and the item comparison. |
| **PO OCR Validation Item** | Child Table | One row per compared item: status, requested qty, PO qty, difference, matched ERPNext item. |

---

## Architecture

```
apps/ai_procurement/
└── ai_procurement/
    ├── hooks.py                          # doctype_js attaches the popup to Material Request
    ├── public/js/
    │   └── material_request_po_ocr.js    # "PO OCR" button + popup dialog + comparison UI
    └── ai_procurement/doctype/
        ├── po_ocr_validation/
        │   ├── po_ocr_validation.json    # DocType definition
        │   └── po_ocr_validation.py      # OCR trigger, comparison logic, save logic
        └── po_ocr_validation_item/
            └── po_ocr_validation_item.json
```

### Server endpoints (whitelisted)

- `run_po_ocr(material_request, file_url)` — runs OCR on the uploaded file and returns the
  extracted data + comparison (does **not** persist anything).
- `save_validation(material_request, file_url, payload)` — persists a `PO OCR Validation`
  record from the dialog result.

---

## Integrating the real OCR engine

OCR is mocked in `_mock_ocr_extraction()` inside
`ai_procurement/ai_procurement/doctype/po_ocr_validation/po_ocr_validation.py`.

Replace it with a call to your engine, returning data in this normalized shape:

```python
{
    "supplier_name": "Dell Technologies",
    "po_number": "EXT-PO-2026-0042",
    "date": "2026-05-29",
    "items": [
        {
            "item_name": "Dell Latitude 5540 Laptop",  # raw text from the PO
            "matched_item": "LAPTOP-DELL-001",          # ERPNext Item code, or None
            "qty": 5,
            "uom": "Nos",
            "confidence": 92.5,
        },
        # ...
    ],
}
```

Item matching (`_match_item`) and the request comparison (`_compare_with_material_request`)
are engine-agnostic and will keep working as-is.

---

## Installation

Install using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch main
bench --site $YOUR_SITE install-app ai_procurement
bench --site $YOUR_SITE migrate
bench build --app ai_procurement
```

**Requires:** Frappe v16 and ERPNext v16 (the app extends ERPNext's Material Request).

### Docker deployment

This repo ships its own containerized deployment (custom image + compose stack)
under [`deploy/`](deploy/README.md) — Ubuntu 24.04 → Python 3.14 → bench →
frappe + erpnext + this app, plus MariaDB and Redis. See `deploy/README.md`.

---

## Contributing

This app uses `pre-commit` for formatting and linting:

```bash
cd apps/ai_procurement
pre-commit install
```

Configured tools: `ruff`, `eslint`, `prettier`, `pyupgrade`.

---

## License

MIT
