// Copyright (c) 2026, Anurag and contributors
// Adds a "PO OCR" option to the Material Request that opens a popup to upload a
// physical PO, run OCR, and validate it against the requested items.

frappe.ui.form.on("Material Request", {
	refresh(frm) {
		if (frm.doc.docstatus === 1) {
			// Place under the existing "Create" group, alongside "Purchase Order"
			frm.add_custom_button(
				__("PO OCR"),
				function () {
					open_po_ocr_dialog(frm);
				},
				__("Create")
			);
		}
	},
});

function open_po_ocr_dialog(frm) {
	const dialog = new frappe.ui.Dialog({
		title: __("PO OCR — Validate Physical PO"),
		size: "large",
		fields: [
			{
				fieldname: "intro_html",
				fieldtype: "HTML",
				options: `<p class="text-muted">
					Upload the physical Purchase Order you received. The AI OCR engine will
					read it and compare the items &amp; quantities against
					<b>Material Request ${frm.doc.name}</b>.</p>`,
			},
			{
				fieldname: "po_file",
				fieldtype: "Attach",
				label: __("Upload PO Document (PDF / Image)"),
				reqd: 1,
				onchange: function () {
					const file_url = dialog.get_value("po_file");
					if (file_url) {
						run_ocr(frm, dialog, file_url);
					}
				},
			},
			{ fieldname: "result_html", fieldtype: "HTML" },
		],
		primary_action_label: __("Save Validation"),
		primary_action: function () {
			save_validation(frm, dialog);
		},
	});

	// Hide the primary (Save) button until OCR has produced a result
	dialog.get_primary_btn().hide();
	dialog.show();
}

function run_ocr(frm, dialog, file_url) {
	const $result = dialog.fields_dict.result_html.$wrapper;

	// Show loader
	$result.html(`
		<div class="text-center" style="padding: 40px 0;">
			<div class="ai-ocr-spinner" style="
				width: 48px; height: 48px; margin: 0 auto 16px;
				border: 4px solid #e0e0e0; border-top-color: #5e64ff;
				border-radius: 50%; animation: ai-ocr-spin 0.8s linear infinite;">
			</div>
			<p style="font-weight: 600; color: #5e64ff;">${__("AI OCR is reading your PO document...")}</p>
			<p class="text-muted">${__("Extracting items, quantities and supplier details")}</p>
		</div>
		<style>
			@keyframes ai-ocr-spin { to { transform: rotate(360deg); } }
		</style>
	`);

	dialog.get_primary_btn().hide();

	frappe.call({
		method: "ai_procurement.ai_procurement.doctype.po_ocr_validation.po_ocr_validation.run_po_ocr",
		args: {
			material_request: frm.doc.name,
			file_url: file_url,
		},
		callback: function (r) {
			if (r.message && r.message.status === "success") {
				render_comparison(dialog, r.message);
				// stash the payload for saving
				dialog._ocr_payload = r.message;
				dialog.get_primary_btn().show();
			} else {
				$result.html(
					`<div class="alert alert-danger">${__("OCR failed. Please try again.")}</div>`
				);
			}
		},
		error: function () {
			$result.html(
				`<div class="alert alert-danger">${__("OCR request failed. Please try again.")}</div>`
			);
		},
	});
}

function render_comparison(dialog, data) {
	const $result = dialog.fields_dict.result_html.$wrapper;
	const summary = data.summary || {};
	const ocr = data.ocr || {};

	// Result badge color
	const result_color = {
		"Fully Matched": "green",
		"Partial Match": "orange",
		Mismatch: "red",
	}[summary.result] || "gray";

	// Status pill colors per row
	const status_color = {
		Matched: "background:#e6f4ea;color:#137333;",
		"Qty Mismatch": "background:#fef7e0;color:#b06000;",
		"Not in Request": "background:#fce8e6;color:#c5221f;",
		"Missing from PO": "background:#fce8e6;color:#c5221f;",
	};

	let rows_html = "";
	(data.comparison || []).forEach(function (row) {
		const pill = status_color[row.status] || "background:#f1f3f4;color:#5f6368;";
		const diff =
			row.qty_difference > 0
				? `+${row.qty_difference}`
				: row.qty_difference || 0;
		rows_html += `
			<tr>
				<td><span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;${pill}">
					${frappe.utils.escape_html(row.status || "")}</span></td>
				<td>${frappe.utils.escape_html(row.item_name || "")}</td>
				<td>${frappe.utils.escape_html(row.matched_item || "—")}</td>
				<td class="text-right">${row.mr_qty || 0}</td>
				<td class="text-right">${row.ocr_qty || 0}</td>
				<td class="text-right" style="font-weight:600;">${diff}</td>
			</tr>`;
	});

	$result.html(`
		<div style="margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap;align-items:center;">
			<div>
				<span class="text-muted" style="font-size:11px;">${__("RESULT")}</span><br>
				<span class="indicator-pill ${result_color}" style="font-size:13px;font-weight:600;">
					${frappe.utils.escape_html(summary.result || "")}</span>
			</div>
			<div><span class="text-muted" style="font-size:11px;">${__("SUPPLIER (OCR)")}</span><br>
				<b>${frappe.utils.escape_html(ocr.supplier_name || "—")}</b></div>
			<div><span class="text-muted" style="font-size:11px;">${__("PO NUMBER")}</span><br>
				<b>${frappe.utils.escape_html(ocr.po_number || "—")}</b></div>
			<div><span class="text-muted" style="font-size:11px;">${__("MATCHED")}</span><br>
				<b style="color:#137333;">${summary.matched || 0}</b></div>
			<div><span class="text-muted" style="font-size:11px;">${__("MISMATCH")}</span><br>
				<b style="color:#c5221f;">${summary.mismatch || 0}</b></div>
		</div>
		<table class="table table-bordered" style="font-size:13px;">
			<thead>
				<tr style="background:#f8f9fa;">
					<th>${__("Status")}</th>
					<th>${__("Item (from PO)")}</th>
					<th>${__("ERPNext Item")}</th>
					<th class="text-right">${__("Requested")}</th>
					<th class="text-right">${__("On PO")}</th>
					<th class="text-right">${__("Diff")}</th>
				</tr>
			</thead>
			<tbody>${rows_html}</tbody>
		</table>
		<p class="text-muted" style="font-size:12px;">
			${__("Processed in")} ${data.processing_time}s.
			${__("Review the comparison above, then click Save Validation to keep an audit record.")}
		</p>
	`);
}

function save_validation(frm, dialog) {
	if (!dialog._ocr_payload) {
		frappe.msgprint(__("Please run OCR first."));
		return;
	}

	frappe.call({
		method: "ai_procurement.ai_procurement.doctype.po_ocr_validation.po_ocr_validation.save_validation",
		args: {
			material_request: frm.doc.name,
			file_url: dialog.get_value("po_file"),
			payload: JSON.stringify(dialog._ocr_payload),
		},
		freeze: true,
		freeze_message: __("Saving validation record..."),
		callback: function (r) {
			if (r.message && r.message.status === "success") {
				dialog.hide();
				frappe.show_alert(
					{ message: r.message.message, indicator: "green" },
					5
				);
				frappe.set_route("Form", "PO OCR Validation", r.message.name);
			}
		},
	});
}
