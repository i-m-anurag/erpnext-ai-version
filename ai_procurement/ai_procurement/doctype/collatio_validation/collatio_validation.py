# Copyright (c) 2026, Anurag and contributors
# For license information, please see license.txt

import json
import time

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, flt, today

# ---------------------------------------------------------------------------
# Flow configuration — the 3-way-match chain.
#   source doctype  --(upload + collate)-->  target doctype (created as Draft)
# ---------------------------------------------------------------------------
COLLATIO_FLOWS = {
	"Material Request": {
		"target_doctype": "Purchase Order",
		"label": "Purchase Order with Collatio",
		"source_link_field": "material_request",
		"source_link_detail": "material_request_item",
	},
	"Purchase Order": {
		"target_doctype": "Purchase Receipt",
		"label": "Purchase Receipt with Collatio",
		"source_link_field": "purchase_order",
		"source_link_detail": "purchase_order_item",
	},
	"Purchase Receipt": {
		"target_doctype": "Purchase Invoice",
		"label": "Purchase Invoice with Collatio",
		"source_link_field": "purchase_receipt",
		"source_link_detail": "pr_detail",
	},
}


class CollatioValidation(Document):
	pass


# ===========================================================================
# Public (whitelisted) API used by the dialog
# ===========================================================================
@frappe.whitelist()
def run_collation(source_doctype, source_name, file_url):
	"""Extract the uploaded document and collate it against the source document.

	Returns the rich extracted header, a per-item comparison, supplier
	resolution status, and a summary. Persists nothing (the dialog decides
	whether to save a validation record / create the target draft).

	NOTE: OCR is MOCKED via _mock_extraction(). Replace that single function
	with a real Collatio API call; the rest is engine-agnostic.
	"""
	flow = _get_flow(source_doctype)
	if not file_url:
		frappe.throw(_("Please upload a document first."))

	source = frappe.get_doc(source_doctype, source_name)

	start = time.time()
	extraction = _mock_extraction(file_url, source, source_doctype)  # <-- swap for real API
	processing_time = round(time.time() - start, 2)

	supplier, supplier_status = _resolve_supplier(extraction.get("supplier_name"))
	comparison, summary = _compare(source, extraction)

	return {
		"status": "success",
		"processing_time": processing_time,
		"flow": {
			"source_doctype": source_doctype,
			"target_doctype": flow["target_doctype"],
			"label": flow["label"],
		},
		"header": {
			"supplier_name": extraction.get("supplier_name"),
			"supplier": supplier,
			"supplier_status": supplier_status,
			"supplier_address": extraction.get("supplier_address"),
			"document_number": extraction.get("document_number"),
			"document_date": extraction.get("document_date"),
			"currency": extraction.get("currency"),
			"payment_terms": extraction.get("payment_terms"),
			"subtotal": extraction.get("subtotal"),
			"tax_amount": extraction.get("tax_amount"),
			"grand_total": extraction.get("grand_total"),
		},
		"comparison": comparison,
		"summary": summary,
		"raw": extraction,
	}


@frappe.whitelist()
def create_supplier_from_extract(supplier_name, supplier_address=None, tax_id=None):
	"""Edge case (a): create a Supplier master from extracted data."""
	if not supplier_name:
		frappe.throw(_("No supplier name to create from."))
	if frappe.db.exists("Supplier", {"supplier_name": supplier_name}):
		return frappe.db.get_value("Supplier", {"supplier_name": supplier_name}, "name")

	supplier = frappe.new_doc("Supplier")
	supplier.supplier_name = supplier_name
	supplier.supplier_group = _default("Supplier Group")
	supplier.supplier_type = "Company"
	if tax_id:
		supplier.tax_id = tax_id
	supplier.flags.ignore_mandatory = True
	supplier.insert(ignore_permissions=True)

	if supplier_address:
		_create_address(supplier_address, "Supplier", supplier.name)

	frappe.db.commit()
	return supplier.name


@frappe.whitelist()
def create_item_from_extract(item_name, uom=None, rate=None):
	"""Edge case (b): create an Item master from an extracted line."""
	if not item_name:
		frappe.throw(_("No item name to create from."))

	item_code = item_name.strip()[:140]
	if frappe.db.exists("Item", item_code):
		return item_code

	item = frappe.new_doc("Item")
	item.item_code = item_code
	item.item_name = item_name
	item.item_group = _default("Item Group")
	item.stock_uom = uom if uom and frappe.db.exists("UOM", uom) else "Nos"
	item.is_stock_item = 1
	item.description = _("Auto-created via Collatio from an uploaded document. Please review.")
	if rate:
		item.standard_rate = flt(rate)
	item.flags.ignore_mandatory = True
	item.insert(ignore_permissions=True)
	frappe.db.commit()
	return item.item_code


@frappe.whitelist()
def save_validation(source_doctype, source_name, file_url, payload):
	"""Persist a Collatio Validation audit record (no target doc created)."""
	doc = _build_validation_doc(source_doctype, source_name, file_url, payload)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"status": "success", "name": doc.name, "message": _("Validation {0} saved.").format(doc.name)}


@frappe.whitelist()
def create_target_document(source_doctype, source_name, file_url, payload):
	"""Create the target document as a DRAFT, pre-filled from the collation,
	then persist a linked Collatio Validation record.
	"""
	if isinstance(payload, str):
		payload = json.loads(payload)

	flow = _get_flow(source_doctype)
	target_doctype = flow["target_doctype"]
	header = payload.get("header", {})
	comparison = payload.get("comparison", [])

	# --- guard rails (edge cases must be resolved) ---
	supplier = header.get("supplier")
	if not supplier:
		frappe.throw(_("Supplier is not resolved. Pick or create a supplier first."))

	usable_rows = [r for r in comparison if r.get("status") != "Missing from Upload"]
	unresolved = [r.get("item_name") for r in usable_rows if not r.get("matched_item")]
	if unresolved:
		frappe.throw(
			_("These items are not mapped to an ERPNext Item: {0}").format(", ".join(unresolved))
		)

	source = frappe.get_doc(source_doctype, source_name)
	company = source.get("company") or _default("Company")

	target = frappe.new_doc(target_doctype)
	target.supplier = supplier
	target.company = company
	if header.get("currency"):
		target.currency = header["currency"]

	_apply_dates(target, target_doctype)
	_apply_warehouse(target, target_doctype, source)

	# map source rows by item_code for traceability links
	source_rows = {d.item_code: d for d in source.get("items", [])}

	for row in usable_rows:
		item_code = row.get("matched_item")
		if not item_code:
			continue
		ti = target.append("items", {
			"item_code": item_code,
			"qty": flt(row.get("extracted_qty")) or flt(row.get("source_qty")) or 1,
			"rate": flt(row.get("rate")),
		})
		# Stock items on a PO/PR require a warehouse.
		if (
			target_doctype in ("Purchase Order", "Purchase Receipt")
			and target.get("set_warehouse")
			and frappe.get_cached_value("Item", item_code, "is_stock_item")
		):
			ti.warehouse = target.set_warehouse
		_apply_item_links(ti, flow, source, source_rows.get(item_code))

	_apply_tax_template(target, company)

	target.flags.ignore_mandatory = True
	target.insert(ignore_permissions=True)  # stays Draft (docstatus = 0)

	# persist the linked validation record
	val = _build_validation_doc(source_doctype, source_name, file_url, payload)
	val.created_document = target.name
	val.insert(ignore_permissions=True)
	frappe.db.commit()

	return {
		"status": "success",
		"target_doctype": target_doctype,
		"target_name": target.name,
		"validation": val.name,
		"message": _("{0} {1} created as Draft.").format(target_doctype, target.name),
	}


# ===========================================================================
# Internal helpers
# ===========================================================================
def _get_flow(source_doctype):
	flow = COLLATIO_FLOWS.get(source_doctype)
	if not flow:
		frappe.throw(_("Collatio is not configured for {0}.").format(source_doctype))
	return flow


def _build_validation_doc(source_doctype, source_name, file_url, payload):
	if isinstance(payload, str):
		payload = json.loads(payload)

	flow = _get_flow(source_doctype)
	header = payload.get("header", {})
	summary = payload.get("summary", {})
	source = frappe.get_doc(source_doctype, source_name)

	doc = frappe.new_doc("Collatio Validation")
	doc.flow_label = flow["label"]
	doc.source_doctype = source_doctype
	doc.source_name = source_name
	doc.target_doctype = flow["target_doctype"]
	doc.company = source.get("company")
	doc.uploaded_file = file_url
	doc.ocr_status = "Extracted"

	doc.supplier_name = header.get("supplier_name")
	doc.supplier = header.get("supplier")
	doc.supplier_status = header.get("supplier_status")
	doc.supplier_address = header.get("supplier_address")
	doc.document_number = header.get("document_number")
	doc.document_date = header.get("document_date")
	doc.currency = header.get("currency")
	doc.payment_terms = header.get("payment_terms")
	doc.subtotal = flt(header.get("subtotal"))
	doc.tax_amount = flt(header.get("tax_amount"))
	doc.grand_total = flt(header.get("grand_total"))

	doc.validation_result = summary.get("result")
	doc.matched_count = summary.get("matched", 0)
	doc.mismatch_count = summary.get("mismatch", 0)
	doc.ocr_raw_response = json.dumps(payload.get("raw", {}), indent=2)

	for row in payload.get("comparison", []):
		doc.append("items", {
			"status": row.get("status"),
			"item_name": row.get("item_name"),
			"matched_item": row.get("matched_item"),
			"source_qty": flt(row.get("source_qty")),
			"extracted_qty": flt(row.get("extracted_qty")),
			"qty_difference": flt(row.get("qty_difference")),
			"rate": flt(row.get("rate")),
			"uom": row.get("uom"),
			"amount": flt(row.get("rate")) * flt(row.get("extracted_qty")),
		})

	return doc


def _resolve_supplier(supplier_name):
	"""Return (supplier_name_or_None, status)."""
	if not supplier_name:
		return None, "Not Found"
	match = frappe.db.get_value("Supplier", {"supplier_name": supplier_name}, "name")
	if not match:
		match = frappe.db.get_value("Supplier", {"supplier_name": ("like", f"%{supplier_name}%")}, "name")
	return (match, "Matched") if match else (None, "Not Found")


def _compare(source, extraction):
	"""Compare extracted items vs the source document's items by ERPNext item code."""
	source_items = {}
	for d in source.get("items", []):
		source_items[d.item_code] = {
			"qty": flt(d.qty),
			"uom": d.get("uom") or d.get("stock_uom"),
			"item_name": d.get("item_name"),
		}

	comparison = []
	seen = set()
	matched = 0
	mismatch = 0

	for ex in extraction.get("items", []):
		item_code = ex.get("matched_item") or _match_item(ex.get("item_name", ""))
		ex_qty = flt(ex.get("qty"))
		row = {
			"item_name": ex.get("item_name"),
			"matched_item": item_code,
			"extracted_qty": ex_qty,
			"rate": flt(ex.get("rate")),
			"uom": ex.get("uom") or "Nos",
		}

		if not item_code:
			# exists on the uploaded doc but no Item master at all
			row.update({"source_qty": 0, "qty_difference": ex_qty, "status": "Not in Master"})
			mismatch += 1
		elif item_code in source_items:
			seen.add(item_code)
			src_qty = source_items[item_code]["qty"]
			row["source_qty"] = src_qty
			row["qty_difference"] = ex_qty - src_qty
			if abs(ex_qty - src_qty) < 0.001:
				row["status"] = "Matched"
				matched += 1
			else:
				row["status"] = "Qty Mismatch"
				mismatch += 1
		else:
			# item master exists but the line was not on the source document
			row.update({"source_qty": 0, "qty_difference": ex_qty, "status": "Not in Source"})
			mismatch += 1

		comparison.append(row)

	# source lines missing from the uploaded document
	for item_code, info in source_items.items():
		if item_code not in seen:
			comparison.append({
				"item_name": info["item_name"],
				"matched_item": item_code,
				"source_qty": info["qty"],
				"extracted_qty": 0,
				"qty_difference": -info["qty"],
				"rate": 0,
				"uom": info["uom"],
				"status": "Missing from Upload",
			})
			mismatch += 1

	if mismatch == 0 and matched > 0:
		result = "Fully Matched"
	elif matched > 0:
		result = "Partial Match"
	else:
		result = "Mismatch"

	summary = {"result": result, "matched": matched, "mismatch": mismatch, "total": len(comparison)}
	return comparison, summary


def _match_item(item_name):
	if not item_name:
		return None
	for keyword in item_name.split()[:3]:
		if len(keyword) < 3:
			continue
		match = frappe.db.get_value(
			"Item", {"item_name": ("like", f"%{keyword}%"), "disabled": 0}, "name"
		)
		if match:
			return match
	return None


def _apply_dates(target, target_doctype):
	d = today()
	if target_doctype == "Purchase Order":
		target.transaction_date = d
		target.schedule_date = add_days(d, 7)
	elif target_doctype == "Purchase Receipt":
		target.posting_date = d
	elif target_doctype == "Purchase Invoice":
		target.posting_date = d
		target.bill_date = d


def _apply_warehouse(target, target_doctype, source):
	"""Stock items on a PO/PR need a target warehouse."""
	if target_doctype not in ("Purchase Order", "Purchase Receipt"):
		return
	wh = source.get("set_warehouse")
	if not wh:
		wh = frappe.db.get_value(
			"Warehouse", {"company": target.company, "is_group": 0}, "name"
		)
	if wh:
		target.set_warehouse = wh


def _apply_item_links(target_item, flow, source, source_row):
	"""Set traceability links so the created doc references the source."""
	if not source_row:
		return
	link_field = flow.get("source_link_field")
	detail_field = flow.get("source_link_detail")
	if link_field and target_item.meta.has_field(link_field):
		target_item.set(link_field, source.name)
	if detail_field and target_item.meta.has_field(detail_field):
		target_item.set(detail_field, source_row.name)


def _apply_tax_template(target, company):
	"""Apply the company's default Purchase Taxes and Charges Template."""
	template = frappe.db.get_value(
		"Purchase Taxes and Charges Template",
		{"company": company, "is_default": 1},
		"name",
	)
	if not template:
		template = frappe.db.get_value(
			"Purchase Taxes and Charges Template", {"company": company}, "name"
		)
	if not template:
		return
	try:
		from erpnext.controllers.accounts_controller import get_taxes_and_charges

		target.taxes_and_charges = template
		for tax in get_taxes_and_charges("Purchase Taxes and Charges Template", template):
			target.append("taxes", tax)
	except Exception:
		frappe.log_error("Collatio: failed to apply tax template")


def _create_address(address_line, party_type, party_name):
	try:
		addr = frappe.new_doc("Address")
		addr.address_title = party_name
		addr.address_type = "Billing"
		addr.address_line1 = address_line[:240]
		addr.append("links", {"link_doctype": party_type, "link_name": party_name})
		addr.flags.ignore_mandatory = True
		addr.insert(ignore_permissions=True)
	except Exception:
		frappe.log_error("Collatio: failed to create address")


def _default(doctype):
	"""First non-group / any record of a master, for sensible defaults."""
	meta = frappe.get_meta(doctype)
	filters = {"is_group": 0} if meta.has_field("is_group") else {}
	return frappe.db.get_value(doctype, filters, "name")


# ===========================================================================
# MOCK extraction — replace with the real Collatio API call.
# Returns the normalized schema the rest of the engine expects:
#   {
#     supplier_name, supplier_address, tax_id, document_number, document_date,
#     currency, payment_terms, subtotal, tax_amount, grand_total,
#     items: [ { item_name, matched_item|None, qty, rate, uom, confidence } ]
#   }
# ===========================================================================
def _mock_extraction(file_url, source, source_doctype):
	time.sleep(2)  # simulate latency

	supplier_name = source.get("supplier") or frappe.db.get_value("Supplier", {}, "supplier_name") or "Dell Technologies"

	items = []
	subtotal = 0.0
	for idx, d in enumerate(source.get("items", [])):
		qty = flt(d.qty)
		if idx == 1:
			qty += 2  # inject a quantity mismatch on the 2nd line for demo
		rate = flt(d.get("rate")) or 1000.0
		subtotal += qty * rate
		items.append({
			"item_name": d.get("item_name") or d.item_code,
			"matched_item": d.item_code,
			"qty": qty,
			"rate": rate,
			"uom": d.get("uom") or d.get("stock_uom") or "Nos",
			"confidence": 90 + idx,
		})

	# an item the supplier shipped that isn't in the master (edge case b)
	items.append({
		"item_name": "Onsite Installation Service",
		"matched_item": None,
		"qty": 1,
		"rate": 1500,
		"uom": "Nos",
		"confidence": 78,
	})
	subtotal += 1500

	tax_amount = round(subtotal * 0.18, 2)
	doc_no_prefix = {"Material Request": "PO", "Purchase Order": "GRN", "Purchase Receipt": "INV"}.get(
		source_doctype, "DOC"
	)

	return {
		"supplier_name": supplier_name,
		"supplier_address": "123 Business Park, Tech City, India - 560001",
		"tax_id": "29ABCDE1234F1Z5",
		"document_number": f"{doc_no_prefix}-EXT-2026-0042",
		"document_date": today(),
		"currency": source.get("currency") or "INR",
		"payment_terms": "Net 30",
		"subtotal": round(subtotal, 2),
		"tax_amount": tax_amount,
		"grand_total": round(subtotal + tax_amount, 2),
		"items": items,
	}
