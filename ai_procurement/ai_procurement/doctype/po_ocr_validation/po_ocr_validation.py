# Copyright (c) 2026, Anurag and contributors
# For license information, please see license.txt

import json
import time

import frappe
from frappe import _
from frappe.model.document import Document


class POOCRValidation(Document):
	pass


@frappe.whitelist()
def run_po_ocr(material_request, file_url):
	"""Run OCR on the uploaded PO document and compare it against the Material Request.

	Returns the OCR-extracted data plus a per-item comparison so the frontend
	can render the validation table inside the dialog. This does NOT save a record;
	saving happens separately via save_validation().

	NOTE: OCR is currently MOCKED. Replace _mock_ocr_extraction() with a real
	OCR engine API call when ready.
	"""
	if not material_request:
		frappe.throw(_("Material Request is required."))
	if not file_url:
		frappe.throw(_("Please upload a PO document first."))

	mr = frappe.get_doc("Material Request", material_request)

	start_time = time.time()

	# --- MOCK OCR (replace with real OCR engine call) ---
	ocr_result = _mock_ocr_extraction(file_url, mr)

	processing_time = round(time.time() - start_time, 2)

	# Build comparison between OCR'd PO items and Material Request items
	comparison, summary = _compare_with_material_request(mr, ocr_result)

	return {
		"status": "success",
		"processing_time": processing_time,
		"ocr": {
			"supplier_name": ocr_result.get("supplier_name"),
			"po_number": ocr_result.get("po_number"),
			"date": ocr_result.get("date"),
		},
		"comparison": comparison,
		"summary": summary,
		"raw": ocr_result,
	}


@frappe.whitelist()
def save_validation(material_request, file_url, payload):
	"""Persist a PO OCR Validation record (audit/history) from the dialog result."""
	if isinstance(payload, str):
		payload = json.loads(payload)

	mr = frappe.get_doc("Material Request", material_request)

	doc = frappe.new_doc("PO OCR Validation")
	doc.material_request = material_request
	doc.company = mr.company
	doc.po_file = file_url
	doc.ocr_status = "Extracted"

	ocr = payload.get("ocr", {})
	doc.supplier_name = ocr.get("supplier_name")
	doc.original_po_number = ocr.get("po_number")
	doc.transaction_date = ocr.get("date")
	doc.ocr_raw_response = json.dumps(payload.get("raw", {}), indent=2)

	summary = payload.get("summary", {})
	doc.validation_result = summary.get("result")
	doc.matched_count = summary.get("matched", 0)
	doc.mismatch_count = summary.get("mismatch", 0)

	for row in payload.get("comparison", []):
		doc.append("items", {
			"status": row.get("status"),
			"item_name": row.get("item_name"),
			"matched_item": row.get("matched_item"),
			"mr_qty": row.get("mr_qty") or 0,
			"ocr_qty": row.get("ocr_qty") or 0,
			"qty_difference": row.get("qty_difference") or 0,
			"uom": row.get("uom"),
		})

	doc.insert(ignore_permissions=True)
	frappe.db.commit()

	return {
		"status": "success",
		"name": doc.name,
		"message": _("Validation record {0} saved.").format(doc.name),
	}


def _compare_with_material_request(mr, ocr_result):
	"""Compare OCR-extracted PO items against the Material Request items.

	Matching key: the ERPNext Item code. OCR items are matched to ERPNext items
	(via matched_item from OCR, or fuzzy name match), then compared to the MR's
	requested quantity for that item.
	"""
	# Build a map of MR items: item_code -> {qty, uom, item_name}
	mr_items = {}
	for d in mr.items:
		mr_items[d.item_code] = {
			"qty": d.qty,
			"uom": d.uom or d.stock_uom,
			"item_name": d.item_name,
		}

	comparison = []
	seen_item_codes = set()
	matched = 0
	mismatch = 0

	# 1. Walk through OCR'd PO items
	for po_item in ocr_result.get("items", []):
		item_code = po_item.get("matched_item") or _match_item(po_item.get("item_name", ""))
		ocr_qty = po_item.get("qty", 0)
		uom = po_item.get("uom", "Nos")

		row = {
			"item_name": po_item.get("item_name"),
			"matched_item": item_code,
			"ocr_qty": ocr_qty,
			"uom": uom,
		}

		if item_code and item_code in mr_items:
			seen_item_codes.add(item_code)
			mr_qty = mr_items[item_code]["qty"]
			row["mr_qty"] = mr_qty
			row["qty_difference"] = ocr_qty - mr_qty
			if abs(ocr_qty - mr_qty) < 0.001:
				row["status"] = "Matched"
				matched += 1
			else:
				row["status"] = "Qty Mismatch"
				mismatch += 1
		else:
			# Item on the PO that was not in the Material Request
			row["mr_qty"] = 0
			row["qty_difference"] = ocr_qty
			row["status"] = "Not in Request"
			mismatch += 1

		comparison.append(row)

	# 2. MR items that never appeared on the PO (missing from PO)
	for item_code, info in mr_items.items():
		if item_code not in seen_item_codes:
			comparison.append({
				"item_name": info["item_name"],
				"matched_item": item_code,
				"mr_qty": info["qty"],
				"ocr_qty": 0,
				"qty_difference": -info["qty"],
				"uom": info["uom"],
				"status": "Missing from PO",
			})
			mismatch += 1

	# Determine overall result
	if mismatch == 0 and matched > 0:
		result = "Fully Matched"
	elif matched > 0 and mismatch > 0:
		result = "Partial Match"
	else:
		result = "Mismatch"

	summary = {
		"result": result,
		"matched": matched,
		"mismatch": mismatch,
		"total": len(comparison),
	}

	return comparison, summary


def _mock_ocr_extraction(file_url, mr):
	"""MOCK OCR engine. Simulates extracting a physical PO document.

	To make the demo meaningful, this derives items from the linked Material
	Request but injects realistic variances:
	  - First item: exact match (Matched)
	  - Second item (if any): quantity off by 2 (Qty Mismatch)
	  - Adds one extra item not in the MR (Not in Request)

	Replace this entire function with a real OCR API call:
	    response = requests.post(OCR_ENDPOINT, files={"file": ...})
	    return _normalize(response.json())
	"""
	time.sleep(2)  # simulate processing latency

	supplier_name = None
	if mr.get("items"):
		# pick a supplier if one is set on the MR's default; else generic
		supplier_name = frappe.db.get_value("Supplier", {}, "supplier_name") or "Dell Technologies"
	else:
		supplier_name = "Dell Technologies"

	items = []
	for idx, d in enumerate(mr.items):
		qty = d.qty
		if idx == 1:
			# inject a quantity mismatch on the 2nd line
			qty = d.qty + 2
		items.append({
			"item_name": d.item_name or d.item_code,
			"matched_item": d.item_code,
			"qty": qty,
			"rate": 0,
			"uom": d.uom or d.stock_uom or "Nos",
			"confidence": 90 + idx,
		})

	# Add one extra item the supplier shipped that wasn't requested
	items.append({
		"item_name": "Shipping & Handling",
		"matched_item": None,
		"qty": 1,
		"rate": 500,
		"uom": "Nos",
		"confidence": 80,
	})

	return {
		"supplier_name": supplier_name,
		"po_number": "EXT-PO-2026-0042",
		"date": frappe.utils.today(),
		"items": items,
	}


def _match_item(item_name):
	"""Fuzzy-match an OCR item name to an existing ERPNext Item code."""
	if not item_name:
		return None
	for keyword in item_name.split()[:3]:
		if len(keyword) < 3:
			continue
		match = frappe.db.get_value(
			"Item",
			{"item_name": ("like", f"%{keyword}%"), "disabled": 0},
			"name",
		)
		if match:
			return match
	return None
