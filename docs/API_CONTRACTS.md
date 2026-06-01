# Collatio — API Contracts

Request/response specification for the two services the backend provides to the
AI Procurement (Collatio) app:

1. **OCR Extraction API** — read a physical procurement document (PO / Goods
   Receipt / Invoice) and return structured fields.
2. **Match Report API** — reconcile Purchase Order ↔ Goods Receipt ↔ Invoice
   (three-way match) and return a pass/fail report for payment approval.

> The Frappe app already implements these shapes with mocked data
> (`_mock_extraction()` and `three_way_match.get_report()`). This document is the
> contract to implement them as real backend HTTP services.

---

## 1. Conventions

| Item | Value |
|------|-------|
| Base URL | `https://<collatio-host>/api/v1` |
| Auth | `Authorization: Bearer <token>` on every request |
| Request body | `multipart/form-data` (file uploads) or `application/json` |
| Response body | `application/json; charset=utf-8` |
| Dates | ISO‑8601 date, `YYYY-MM-DD` |
| Numbers | JSON numbers (no thousands separators); money as decimals, e.g. `72000.00` |
| Currency | ISO‑4217 3‑letter code, e.g. `INR` |
| Nullable | A field that can be unknown is sent as `null` (not omitted) |

### Error format (all endpoints)

Non‑2xx responses use a single shape:

```json
{
  "error": {
    "code": "INVALID_FILE",
    "message": "Unsupported file type. Allowed: pdf, png, jpg, jpeg.",
    "details": null
  }
}
```

| HTTP | `code` examples |
|------|-----------------|
| 400 | `INVALID_FILE`, `MISSING_FIELD`, `BAD_REQUEST` |
| 401 | `UNAUTHORIZED` |
| 422 | `EXTRACTION_FAILED`, `UNREADABLE_DOCUMENT` |
| 500 | `INTERNAL_ERROR` |

---

## 2. OCR Extraction API

Reads one uploaded document and returns its structured contents. **The same
response shape is used for all document types** (PO, Goods Receipt, Invoice) —
only the values differ — so a single endpoint covers every Collatio step.

### `POST /ocr/extract`

#### Request — `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | binary | ✅ | The document. Allowed: `pdf`, `png`, `jpg`, `jpeg`. Max 20 MB. |
| `document_type` | string | optional | Hint: `purchase_order` \| `goods_receipt` \| `invoice`. Improves accuracy; engine may auto-detect if omitted. |
| `currency_hint` | string | optional | Expected currency, e.g. `INR`. |
| `reference_id` | string | optional | Caller's correlation id, echoed back in the response. |

```bash
curl -X POST https://collatio-host/api/v1/ocr/extract \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@purchase_order.pdf" \
  -F "document_type=purchase_order" \
  -F "currency_hint=INR"
```

#### Response — `200 OK`

```json
{
  "reference_id": "abc-123",
  "document_type": "purchase_order",
  "supplier_name": "Dell Technologies",
  "supplier_address": "123 Business Park, Tech City, India - 560001",
  "tax_id": "29ABCDE1234F1Z5",
  "document_number": "PO-EXT-2026-0042",
  "document_date": "2026-05-31",
  "currency": "INR",
  "payment_terms": "Net 30",
  "subtotal": 360000.00,
  "tax_amount": 64800.00,
  "grand_total": 424800.00,
  "items": [
    {
      "item_name": "Dell Latitude 5540 Laptop",
      "matched_item": "LAPTOP-DELL-001",
      "qty": 5,
      "rate": 72000.00,
      "uom": "Nos",
      "confidence": 92.5
    },
    {
      "item_name": "Onsite Installation Service",
      "matched_item": null,
      "qty": 1,
      "rate": 1500.00,
      "uom": "Nos",
      "confidence": 78.0
    }
  ]
}
```

#### Response fields

| Field | Type | Req. | Notes |
|-------|------|------|-------|
| `reference_id` | string \| null | — | Echo of the request value |
| `document_type` | string | — | Detected/echoed type |
| `supplier_name` | string | ✅ | Plain text as printed |
| `supplier_address` | string \| null | — | Header display |
| `tax_id` | string \| null | — | GSTIN / VAT / TIN |
| `document_number` | string \| null | — | Supplier's own PO/GRN/invoice number |
| `document_date` | string \| null | — | ISO date |
| `currency` | string \| null | — | ISO‑4217; defaults to `INR` if null |
| `payment_terms` | string \| null | — | e.g. `Net 30` |
| `subtotal` / `tax_amount` / `grand_total` | number \| null | — | For display + validation |
| `items` | array | ✅ | One object per line item |
| `items[].item_name` | string | ✅ | Raw line text |
| `items[].matched_item` | string \| **null** | ✅ | ERPNext **Item code** if the engine can map it; else `null` (the app fuzzy‑matches / flags "Not in Master") |
| `items[].qty` | number | ✅ | |
| `items[].rate` | number | ✅ | Unit price |
| `items[].uom` | string \| null | — | Defaults to `Nos` |
| `items[].confidence` | number \| null | — | 0–100 |

> **Key field:** `items[].matched_item`. Return the ERPNext item code only when
> confident; otherwise `null` — never guess. The app resolves unmatched lines.

---

## 3. Match Report API (Three-Way Match)

Reconciles a Purchase Order, its Goods Receipt(s), and the Invoice line‑by‑line,
applies tolerances, runs control checks, and returns an overall verdict used to
approve payment. Lines are matched across the three documents by **`item_code`**
(or by `line_ref` if provided).

### `POST /match/three-way`

#### Request — `application/json`

```json
{
  "currency": "INR",
  "ap_analyst": "Priya Nair",
  "tolerances": {
    "price_variance_percent": 2,
    "quantity_variance_units": 0,
    "tax_compliance_percent": 18
  },
  "purchase_order": {
    "id": "PUR-ORD-2026-00013",
    "lines": [
      { "item_code": "LAPTOP-DELL-001", "description": "Dell Latitude 5540", "qty": 5, "rate": 72000.00 }
    ]
  },
  "goods_receipt": {
    "id": "MAT-PRE-2026-00003",
    "lines": [
      { "item_code": "LAPTOP-DELL-001", "qty": 5 }
    ]
  },
  "invoice": {
    "id": "ACC-PINV-2026-00009",
    "bill_no": "INV-TSG-2024-44621",
    "tax_amount": 64800.00,
    "outstanding": 424800.00,
    "lines": [
      { "item_code": "LAPTOP-DELL-001", "description": "Dell Latitude 5540", "qty": 5, "rate": 72000.00 }
    ]
  }
}
```

#### Request fields

| Field | Type | Req. | Notes |
|-------|------|------|-------|
| `currency` | string | — | ISO‑4217 |
| `ap_analyst` | string | — | Shown in the report header |
| `tolerances.price_variance_percent` | number | ✅ | Allowed unit‑price deviation vs PO (e.g. `2` = ±2%) |
| `tolerances.quantity_variance_units` | number | ✅ | Allowed qty deviation across the three docs (e.g. `0` = strict) |
| `tolerances.tax_compliance_percent` | number | — | Expected tax rate for the compliance check |
| `purchase_order.id` / `goods_receipt.id` / `invoice.id` | string | ✅ | Document numbers (for the header) |
| `invoice.bill_no` | string | — | Supplier invoice number (used for duplicate check) |
| `invoice.tax_amount` | number | — | For the tax‑compliance row |
| `invoice.outstanding` | number | — | Amount payable |
| `*.lines[].item_code` | string | ✅ | Match key across documents |
| `*.lines[].qty` | number | ✅ | PO ordered / GR received / Invoice billed |
| `po/invoice .lines[].rate` | number | ✅ | Unit price (GR lines need only qty) |
| `*.lines[].line_ref` | string | — | Optional explicit cross‑doc line id (overrides item_code matching) |

#### Response — `200 OK`

```json
{
  "header": {
    "invoice_no": "ACC-PINV-2026-00009",
    "bill_no": "INV-TSG-2024-44621",
    "match_date": "2026-05-31",
    "po_no": "PUR-ORD-2026-00013",
    "gr_no": "MAT-PRE-2026-00003",
    "ap_analyst": "Priya Nair",
    "supplier": "Dell Technologies",
    "overall_result": "MATCH — APPROVED FOR PAYMENT",
    "approved": true
  },
  "lines": [
    {
      "line": "L.001",
      "description": "Dell Latitude 5540",
      "po_qty": 5, "gr_qty": 5, "inv_qty": 5,
      "qty_match": true,
      "po_price": 72000.00, "inv_price": 72000.00, "variance": 0.00,
      "price_match": true,
      "po_total": 360000.00, "inv_total": 360000.00,
      "result": "PASS"
    }
  ],
  "totals": { "po_total": 360000.00, "inv_total": 360000.00, "match": true },
  "tolerances": [
    { "control": "Price Variance",    "setting": "±2% of PO price",         "result": "0.00",    "status": "WITHIN TOLERANCE", "ok": true },
    { "control": "Quantity Variance", "setting": "±0 units (strict)",       "result": "0 units", "status": "WITHIN TOLERANCE", "ok": true },
    { "control": "Tax Amount",        "setting": "Per TX State Rules (18%)", "result": "64800.00","status": "COMPLIANT",        "ok": true }
  ],
  "checks": [
    { "control": "Duplicate Check",     "detail": "Vendor + Inv No + Amount", "result": "No duplicate",            "status": "CLEAR", "ok": true },
    { "control": "Vendor Verification", "detail": "Approved vendor master",   "result": "Dell Technologies verified","status": "CLEAR", "ok": true }
  ],
  "currency": "INR",
  "outstanding": 424800.00,
  "next_action": "Invoice approved for payment run"
}
```

#### Response fields

| Field | Type | Notes |
|-------|------|-------|
| `header.overall_result` | string | `"MATCH — APPROVED FOR PAYMENT"` or `"MISMATCH — REVIEW REQUIRED"` |
| `header.approved` | boolean | `true` only if every line passed |
| `lines[].po_qty` / `gr_qty` / `inv_qty` | number \| null | `null` if that document has no matching line |
| `lines[].qty_match` | boolean | All three quantities within `quantity_variance_units` |
| `lines[].variance` | number | `inv_price − po_price` |
| `lines[].price_match` | boolean | `|variance|` within `price_variance_percent` of PO price |
| `lines[].result` | string | `"PASS"` \| `"FAIL"` |
| `totals.match` | boolean | PO total == Invoice total |
| `tolerances[]` / `checks[]` | array | Rows for the report's lower tables; each has `control`, `setting`/`detail`, `result`, `status`, `ok` |
| `checks[].status` | string | `"CLEAR"` \| `"REVIEW"` (or `"WITHIN TOLERANCE"` / `"EXCEEDED"` / `"COMPLIANT"` for tolerance rows) |
| `next_action` | string | Human‑readable recommendation |

---

## 4. Enums (quick reference)

| Enum | Values |
|------|--------|
| `document_type` | `purchase_order`, `goods_receipt`, `invoice` |
| line `result` | `PASS`, `FAIL` |
| `overall_result` | `MATCH — APPROVED FOR PAYMENT`, `MISMATCH — REVIEW REQUIRED` |
| tolerance `status` | `WITHIN TOLERANCE`, `EXCEEDED`, `COMPLIANT` |
| check `status` | `CLEAR`, `REVIEW` |

---

## 5. How the app wires these in (for context)

- **OCR Extraction** replaces `_mock_extraction()` in
  `ai_procurement/ai_procurement/doctype/collatio_validation/collatio_validation.py`.
  The app then matches the extracted lines against the source ERPNext document
  and resolves supplier/items.
- **Match Report**: today the app computes this in
  `ai_procurement/ai_procurement/three_way_match.py` by traversing the linked
  ERPNext documents. If you move it to a backend service, the app will POST the
  three documents' lines (above) and render the returned report unchanged.
- Tolerances and the AP‑analyst name are configurable in
  `ai_procurement/mock_data.json` (`three_way_match` block) and would be passed
  through as the `tolerances` / `ap_analyst` request fields.

---

_Version 1.0 — keep this file in sync with `mock_data.json` and the response
shapes in the two modules above._
