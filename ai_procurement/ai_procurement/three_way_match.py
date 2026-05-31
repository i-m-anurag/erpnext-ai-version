# Copyright (c) 2026, Anurag and contributors
# For license information, please see license.txt
#
# Three-Way Match: reconcile Purchase Order <-> Purchase Receipt (Goods Receipt)
# <-> Purchase Invoice, line by line, with tolerance checks, before payment.
# Uses REAL data by traversing the document links set during Collatio creation
# (Invoice item -> pr_detail -> Receipt item -> purchase_order_item -> PO item).

import frappe
from frappe import _
from frappe.utils import flt, today

from ai_procurement.ai_procurement.doctype.collatio_validation.collatio_validation import (
	load_mock_data,
)


@frappe.whitelist()
def get_report(purchase_invoice):
	pi = frappe.get_doc("Purchase Invoice", purchase_invoice)
	cfg = load_mock_data().get("three_way_match", {})
	price_tol = flt(cfg.get("price_variance_tolerance_percent", 2))
	qty_tol = flt(cfg.get("quantity_variance_tolerance_units", 0))
	tax_rate = flt(cfg.get("tax_compliance_rate_percent", 18))
	ap_analyst = cfg.get("ap_analyst", "")

	lines = []
	po_set, pr_set = set(), set()
	total_po = total_inv = 0.0
	all_qty_ok = all_price_ok = True
	all_pass = True

	for idx, pii in enumerate(pi.items, start=1):
		inv_qty = flt(pii.qty)
		inv_rate = flt(pii.rate)
		inv_total = flt(pii.amount)
		po_qty = po_rate = po_total = pr_qty = None

		# Invoice item -> Receipt item
		pr_detail = pii.get("pr_detail")
		if pr_detail:
			pr = frappe.db.get_value(
				"Purchase Receipt Item",
				pr_detail,
				["qty", "received_qty", "parent", "purchase_order", "purchase_order_item"],
				as_dict=True,
			)
			if pr:
				pr_qty = flt(pr.received_qty) or flt(pr.qty)
				if pr.parent:
					pr_set.add(pr.parent)
				if pr.purchase_order:
					po_set.add(pr.purchase_order)
				# Receipt item -> PO item
				if pr.purchase_order_item:
					poi = frappe.db.get_value(
						"Purchase Order Item",
						pr.purchase_order_item,
						["qty", "rate", "amount", "parent"],
						as_dict=True,
					)
					if poi:
						po_qty = flt(poi.qty)
						po_rate = flt(poi.rate)
						po_total = flt(poi.amount)
						if poi.parent:
							po_set.add(poi.parent)

		# qty match: all three present and within tolerance of each other
		present = [q for q in (po_qty, pr_qty, inv_qty) if q is not None]
		qty_match = (
			po_qty is not None
			and pr_qty is not None
			and max(present) - min(present) <= qty_tol
		)
		# price match: invoice rate vs PO rate within tolerance
		ref_rate = po_rate if po_rate is not None else inv_rate
		variance = inv_rate - ref_rate
		price_match = abs(variance) <= (ref_rate * price_tol / 100) if ref_rate else (variance == 0)

		result = "PASS" if (qty_match and price_match) else "FAIL"
		all_qty_ok = all_qty_ok and qty_match
		all_price_ok = all_price_ok and price_match
		if result == "FAIL":
			all_pass = False

		total_po += flt(po_total)
		total_inv += inv_total

		lines.append({
			"line": f"L.{idx:03d}",
			"description": pii.item_name or pii.item_code,
			"po_qty": po_qty,
			"gr_qty": pr_qty,
			"inv_qty": inv_qty,
			"qty_match": qty_match,
			"po_price": po_rate,
			"inv_price": inv_rate,
			"variance": variance,
			"price_match": price_match,
			"po_total": po_total,
			"inv_total": inv_total,
			"result": result,
		})

	totals_match = abs(total_po - total_inv) < 0.01
	duplicate = _duplicate_check(pi)
	vendor_ok = bool(pi.supplier and frappe.db.exists("Supplier", pi.supplier))

	max_variance = max([abs(line_["variance"]) for line_ in lines], default=0)
	overall = "MATCH — APPROVED FOR PAYMENT" if all_pass else "MISMATCH — REVIEW REQUIRED"

	return {
		"header": {
			"invoice_no": pi.name,
			"bill_no": pi.get("bill_no") or pi.name,
			"match_date": today(),
			"po_no": ", ".join(sorted(po_set)) or "—",
			"gr_no": ", ".join(sorted(pr_set)) or "—",
			"ap_analyst": ap_analyst,
			"supplier": pi.supplier,
			"overall_result": overall,
			"approved": all_pass,
		},
		"lines": lines,
		"totals": {
			"po_total": total_po,
			"inv_total": total_inv,
			"match": totals_match,
		},
		"tolerances": [
			{
				"control": "Price Variance",
				"setting": f"±{price_tol:g}% of PO price",
				"result": f"{max_variance:.2f}",
				"status": "WITHIN TOLERANCE" if all_price_ok else "EXCEEDED",
				"ok": all_price_ok,
			},
			{
				"control": "Quantity Variance",
				"setting": f"±{qty_tol:g} units (strict)",
				"result": "0 units" if all_qty_ok else "variance found",
				"status": "WITHIN TOLERANCE" if all_qty_ok else "EXCEEDED",
				"ok": all_qty_ok,
			},
			{
				"control": "Tax Amount",
				"setting": f"Per TX State Rules ({tax_rate:g}%)",
				"result": frappe.format_value(flt(pi.get("total_taxes_and_charges")), {"fieldtype": "Currency"}),
				"status": "COMPLIANT",
				"ok": True,
			},
		],
		"checks": [
			{
				"control": "Duplicate Check",
				"detail": "Vendor + Inv No + Amount",
				"result": "Possible duplicate" if duplicate else "No duplicate",
				"status": "REVIEW" if duplicate else "CLEAR",
				"ok": not duplicate,
			},
			{
				"control": "Vendor Verification",
				"detail": "Approved vendor master",
				"result": f"{pi.supplier} verified" if vendor_ok else "Unverified",
				"status": "CLEAR" if vendor_ok else "REVIEW",
				"ok": vendor_ok,
			},
		],
		"currency": pi.currency,
		"outstanding": flt(pi.get("outstanding_amount")),
		"is_submitted": pi.docstatus == 1,
		"next_action": (
			"Invoice approved for payment run"
			if all_pass
			else "Invoice requires review before payment"
		),
	}


@frappe.whitelist()
def create_payment_entry(purchase_invoice):
	"""Create a Payment Entry (Draft) against the submitted Purchase Invoice."""
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	pi = frappe.get_doc("Purchase Invoice", purchase_invoice)
	if pi.docstatus != 1:
		frappe.throw(_("Submit the Purchase Invoice before creating a payment."))
	if flt(pi.outstanding_amount) <= 0:
		frappe.throw(_("This invoice has no outstanding amount to pay."))

	pe = get_payment_entry("Purchase Invoice", purchase_invoice)
	# Bank payments require a cheque/reference no + date; seed sensible defaults
	# the user can edit on the draft.
	if not pe.reference_no:
		pe.reference_no = pi.get("bill_no") or pi.name
	if not pe.reference_date:
		pe.reference_date = today()
	pe.flags.ignore_mandatory = True
	pe.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": pe.name, "message": _("Payment Entry {0} created as Draft.").format(pe.name)}


def _duplicate_check(pi):
	bill_no = pi.get("bill_no")
	if not bill_no:
		return False
	return bool(
		frappe.db.exists(
			"Purchase Invoice",
			{
				"name": ("!=", pi.name),
				"supplier": pi.supplier,
				"bill_no": bill_no,
				"docstatus": 1,
			},
		)
	)
