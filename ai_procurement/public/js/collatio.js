// Copyright (c) 2026, Anurag and contributors
// Collatio: upload a physical document, OCR-extract it, collate against the
// current source document, resolve supplier/items, and create the target
// document as a Draft. Attached to Material Request, Purchase Order and
// Purchase Receipt (the 3-way-match chain).

const COLLATIO_BY_SOURCE = {
	"Material Request": { target: "Purchase Order", label: "Purchase Order with Collatio" },
	"Purchase Order": { target: "Purchase Receipt", label: "Purchase Receipt with Collatio" },
	"Purchase Receipt": { target: "Purchase Invoice", label: "Purchase Invoice with Collatio" },
};

const METHOD = "ai_procurement.ai_procurement.doctype.collatio_validation.collatio_validation";

const STATUS_PILL = {
	Matched: "background:#e6f4ea;color:#137333;",
	Resolved: "background:#e6f4ea;color:#137333;",
	"Qty Mismatch": "background:#fef7e0;color:#b06000;",
	"Not in Source": "background:#fce8e6;color:#c5221f;",
	"Missing from Upload": "background:#fce8e6;color:#c5221f;",
	"Not in Master": "background:#f3e8fd;color:#8430ce;",
};

["Material Request", "Purchase Order", "Purchase Receipt"].forEach((dt) => {
	frappe.ui.form.on(dt, {
		refresh(frm) {
			const cfg = COLLATIO_BY_SOURCE[frm.doctype];
			if (!cfg || frm.doc.docstatus !== 1) return;
			frm.add_custom_button(__(cfg.label), () => open_collatio_dialog(frm, cfg), __("Create"));
		},
	});
});

function open_collatio_dialog(frm, cfg) {
	const dialog = new frappe.ui.Dialog({
		title: __(cfg.label),
		size: "extra-large",
		fields: [
			{
				fieldname: "intro_html",
				fieldtype: "HTML",
				options: `<p class="text-muted">Upload the physical document. Collatio will read it and
					collate items &amp; quantities against <b>${frappe.utils.escape_html(frm.doc.name)}</b>,
					then let you create a draft <b>${cfg.target}</b>.</p>`,
			},
			{
				fieldname: "doc_file",
				fieldtype: "Attach",
				label: __("Upload Document (PDF / Image)"),
				reqd: 1,
				onchange() {
					const f = dialog.get_value("doc_file");
					if (f) run_collation(frm, dialog, cfg, f);
				},
			},
			{ fieldname: "result_html", fieldtype: "HTML" },
		],
		primary_action_label: __("Create {0} (Draft)", [cfg.target]),
		primary_action: () => create_target(frm, dialog, cfg),
		secondary_action_label: __("Save Validation Only"),
		secondary_action: () => save_validation(frm, dialog),
	});

	dialog._cfg = cfg;
	dialog._frm = frm;
	dialog.get_primary_btn().hide();
	dialog.get_secondary_btn && dialog.get_secondary_btn().hide();
	dialog.show();
}

function run_collation(frm, dialog, cfg, file_url) {
	const $r = dialog.fields_dict.result_html.$wrapper;
	$r.html(spinner_html());
	dialog.get_primary_btn().hide();

	frappe.call({
		method: `${METHOD}.run_collation`,
		args: { source_doctype: frm.doctype, source_name: frm.doc.name, file_url },
		callback(r) {
			if (r.message && r.message.status === "success") {
				dialog._payload = r.message;
				render(frm, dialog, cfg);
			} else {
				$r.html(`<div class="alert alert-danger">${__("Extraction failed.")}</div>`);
			}
		},
		error() {
			$r.html(`<div class="alert alert-danger">${__("Extraction request failed.")}</div>`);
		},
	});
}

function render(frm, dialog, cfg) {
	const data = dialog._payload;
	const h = data.header || {};
	const sum = data.summary || {};
	const $r = dialog.fields_dict.result_html.$wrapper;

	const result_color =
		{ "Fully Matched": "green", "Partial Match": "orange", Mismatch: "red" }[sum.result] || "gray";

	// ---- supplier block (resolved / needs action) ----
	let supplier_block;
	if (h.supplier) {
		supplier_block = `<b>${frappe.utils.escape_html(h.supplier)}</b>
			<span class="indicator-pill green" style="font-size:10px;">${h.supplier_status || "Matched"}</span>`;
	} else {
		supplier_block = `<b style="color:#c5221f;">${frappe.utils.escape_html(h.supplier_name || "Unknown")}</b>
			<span class="indicator-pill red" style="font-size:10px;">Not in ERPNext</span>
			<button class="btn btn-xs btn-default coll-sel-supplier" style="margin-left:6px;">${__("Select")}</button>
			<button class="btn btn-xs btn-primary coll-new-supplier">${__("Create")}</button>`;
	}

	// ---- item rows ----
	let rows = "";
	(data.comparison || []).forEach((row, i) => {
		const pill = STATUS_PILL[row.status] || "background:#f1f3f4;color:#5f6368;";
		const diff = row.qty_difference > 0 ? `+${row.qty_difference}` : row.qty_difference || 0;
		let item_cell = frappe.utils.escape_html(row.matched_item || "—");
		if (!row.matched_item && row.status !== "Missing from Upload") {
			item_cell = `<span style="color:#c5221f;">—</span>
				<button class="btn btn-xs btn-default coll-map-item" data-i="${i}">${__("Map")}</button>
				<button class="btn btn-xs btn-primary coll-new-item" data-i="${i}">${__("Create")}</button>`;
		}
		rows += `<tr>
			<td><span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;${pill}">${frappe.utils.escape_html(row.status || "")}</span></td>
			<td>${frappe.utils.escape_html(row.item_name || "")}</td>
			<td>${item_cell}</td>
			<td class="text-right">${row.source_qty || 0}</td>
			<td class="text-right">${row.extracted_qty || 0}</td>
			<td class="text-right" style="font-weight:600;">${diff}</td>
			<td class="text-right">${row.rate ? format_currency(row.rate, h.currency) : "—"}</td>
		</tr>`;
	});

	$r.html(`
		<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:10px;">
			<div><div class="text-muted" style="font-size:11px;">RESULT</div>
				<span class="indicator-pill ${result_color}" style="font-weight:600;">${frappe.utils.escape_html(sum.result || "")}</span></div>
			<div><div class="text-muted" style="font-size:11px;">SUPPLIER (OCR)</div>${supplier_block}</div>
			<div><div class="text-muted" style="font-size:11px;">DOC NO.</div><b>${frappe.utils.escape_html(h.document_number || "—")}</b></div>
			<div><div class="text-muted" style="font-size:11px;">DATE</div><b>${frappe.utils.escape_html(h.document_date || "—")}</b></div>
			<div><div class="text-muted" style="font-size:11px;">PAYMENT</div><b>${frappe.utils.escape_html(h.payment_terms || "—")}</b></div>
		</div>
		<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:12px;font-size:13px;">
			<div class="text-muted">Supplier address: <span style="color:#202124;">${frappe.utils.escape_html(h.supplier_address || "—")}</span></div>
			<div class="text-muted">Subtotal: <b>${format_currency(h.subtotal || 0, h.currency)}</b></div>
			<div class="text-muted">Tax: <b>${format_currency(h.tax_amount || 0, h.currency)}</b></div>
			<div class="text-muted">Grand Total: <b>${format_currency(h.grand_total || 0, h.currency)}</b></div>
		</div>
		<table class="table table-bordered" style="font-size:13px;">
			<thead><tr style="background:#f8f9fa;">
				<th>Status</th><th>Item (from upload)</th><th>ERPNext Item</th>
				<th class="text-right">Source</th><th class="text-right">Upload</th>
				<th class="text-right">Diff</th><th class="text-right">Rate</th>
			</tr></thead>
			<tbody>${rows}</tbody>
		</table>
		<p class="text-muted" style="font-size:12px;">Processed in ${data.processing_time}s.
			Resolve any unmatched supplier/items, then create the draft or just save the validation.</p>
	`);

	bind_resolution_handlers(frm, dialog, cfg);

	// show actions; gate "Create Draft" on full resolution
	if (dialog.get_secondary_btn) dialog.get_secondary_btn().show();
	if (is_ready_to_create(data)) dialog.get_primary_btn().show();
	else dialog.get_primary_btn().hide();
}

function bind_resolution_handlers(frm, dialog, cfg) {
	const data = dialog._payload;
	const $r = dialog.fields_dict.result_html.$wrapper;

	$r.find(".coll-sel-supplier").on("click", () => {
		frappe.prompt(
			[{ fieldtype: "Link", options: "Supplier", label: __("Supplier"), reqd: 1, fieldname: "s" }],
			(v) => {
				data.header.supplier = v.s;
				data.header.supplier_status = "Matched";
				render(frm, dialog, cfg);
			},
			__("Select Supplier")
		);
	});

	$r.find(".coll-new-supplier").on("click", () => {
		frappe.call({
			method: `${METHOD}.create_supplier_from_extract`,
			args: {
				supplier_name: data.header.supplier_name,
				supplier_address: data.header.supplier_address,
				tax_id: (data.raw || {}).tax_id,
			},
			freeze: true,
			callback(r) {
				if (r.message) {
					data.header.supplier = r.message;
					data.header.supplier_status = "Created";
					frappe.show_alert({ message: __("Supplier {0} created", [r.message]), indicator: "green" });
					render(frm, dialog, cfg);
				}
			},
		});
	});

	$r.find(".coll-map-item").on("click", function () {
		const i = $(this).data("i");
		frappe.prompt(
			[{ fieldtype: "Link", options: "Item", label: __("ERPNext Item"), reqd: 1, fieldname: "it" }],
			(v) => {
				data.comparison[i].matched_item = v.it;
				data.comparison[i].status = "Resolved";
				render(frm, dialog, cfg);
			},
			__("Map to Item")
		);
	});

	$r.find(".coll-new-item").on("click", function () {
		const i = $(this).data("i");
		const row = data.comparison[i];
		frappe.call({
			method: `${METHOD}.create_item_from_extract`,
			args: { item_name: row.item_name, uom: row.uom, rate: row.rate },
			freeze: true,
			callback(r) {
				if (r.message) {
					row.matched_item = r.message;
					row.status = "Resolved";
					frappe.show_alert({ message: __("Item {0} created", [r.message]), indicator: "green" });
					render(frm, dialog, cfg);
				}
			},
		});
	});
}

function is_ready_to_create(data) {
	if (!data.header || !data.header.supplier) return false;
	return (data.comparison || []).every(
		(r) => r.status === "Missing from Upload" || r.matched_item
	);
}

function create_target(frm, dialog, cfg) {
	if (!is_ready_to_create(dialog._payload)) {
		frappe.msgprint({
			title: __("Resolve first"),
			message: __("Please resolve the supplier and all unmatched items before creating the draft."),
			indicator: "orange",
		});
		return;
	}
	frappe.call({
		method: `${METHOD}.create_target_document`,
		args: {
			source_doctype: frm.doctype,
			source_name: frm.doc.name,
			file_url: dialog.get_value("doc_file"),
			payload: JSON.stringify(dialog._payload),
		},
		freeze: true,
		freeze_message: __("Creating {0} draft...", [cfg.target]),
		callback(r) {
			if (r.message && r.message.status === "success") {
				dialog.hide();
				frappe.show_alert({ message: r.message.message, indicator: "green" }, 5);
				frappe.set_route("Form", r.message.target_doctype, r.message.target_name);
			}
		},
	});
}

function save_validation(frm, dialog) {
	if (!dialog._payload) return;
	frappe.call({
		method: `${METHOD}.save_validation`,
		args: {
			source_doctype: frm.doctype,
			source_name: frm.doc.name,
			file_url: dialog.get_value("doc_file"),
			payload: JSON.stringify(dialog._payload),
		},
		freeze: true,
		callback(r) {
			if (r.message && r.message.status === "success") {
				dialog.hide();
				frappe.show_alert({ message: r.message.message, indicator: "green" }, 5);
				frappe.set_route("Form", "Collatio Validation", r.message.name);
			}
		},
	});
}

function spinner_html() {
	return `<div class="text-center" style="padding:40px 0;">
		<div style="width:48px;height:48px;margin:0 auto 16px;border:4px solid #e0e0e0;border-top-color:#5e64ff;border-radius:50%;animation:coll-spin .8s linear infinite;"></div>
		<p style="font-weight:600;color:#5e64ff;">${__("Collatio is reading your document...")}</p>
		<p class="text-muted">${__("Extracting supplier, items, quantities, taxes & totals")}</p>
		<style>@keyframes coll-spin{to{transform:rotate(360deg);}}</style>
	</div>`;
}
