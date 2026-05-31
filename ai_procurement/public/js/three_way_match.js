// Copyright (c) 2026, Anurag and contributors
// Three-Way Match report popup on the Purchase Invoice: reconciles PO <-> Goods
// Receipt <-> Invoice line-by-line with tolerances, before proceeding to payment.

const TWM_METHOD = "ai_procurement.ai_procurement.three_way_match";

frappe.ui.form.on("Purchase Invoice", {
	refresh(frm) {
		if (frm.doc.docstatus !== 1) return;
		frm.add_custom_button(__("Three-Way Match"), () => open_twm(frm));
	},
});

function open_twm(frm) {
	const dialog = new frappe.ui.Dialog({
		title: __("Three-Way Match Report"),
		size: "extra-large",
		fields: [{ fieldname: "report_html", fieldtype: "HTML" }],
	});
	dialog.show();

	const $r = dialog.fields_dict.report_html.$wrapper;
	$r.html(`<div class="text-center text-muted" style="padding:40px;">${__("Reconciling PO ↔ Goods Receipt ↔ Invoice...")}</div>`);

	frappe.call({
		method: `${TWM_METHOD}.get_report`,
		args: { purchase_invoice: frm.doc.name },
		callback(r) {
			if (r.message) render_twm(frm, dialog, r.message);
			else $r.html(`<div class="alert alert-danger">${__("Could not build the report.")}</div>`);
		},
	});
}

function render_twm(frm, dialog, data) {
	const h = data.header;
	const cur = data.currency;
	const fc = (v) => (v === null || v === undefined ? "—" : format_currency(v, cur));
	const fq = (v) => (v === null || v === undefined ? "—" : v);
	const tick = (ok) =>
		`<span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:${ok ? "#137333" : "#c5221f"};"></span>`;

	const overall_bg = h.approved ? "#0b8043" : "#c5221f";

	// header band
	const header = `
		<div style="background:#fff;border:1px solid #e0d0cc;border-top:4px solid #9a2a23;padding:14px 16px;">
			<div style="color:#9a2a23;font-weight:700;font-size:16px;letter-spacing:.3px;">THREE-WAY MATCH REPORT</div>
			<div class="text-muted" style="font-size:12px;margin-bottom:10px;">AP Control Document — PO ↔ Goods Receipt ↔ Invoice Reconciliation</div>
			<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#e0d0cc;border:1px solid #e0d0cc;">
				${cell("Invoice No", h.bill_no)}
				${cell("PO No", h.po_no)}
				${cell("GR No", h.gr_no)}
				${cell("Overall Result", `<span style="color:#fff;background:${overall_bg};padding:2px 6px;border-radius:3px;font-size:11px;font-weight:700;">${frappe.utils.escape_html(h.overall_result)}</span>`, true)}
				${cell("Match Date", h.match_date)}
				${cell("AP Analyst", h.ap_analyst || "—")}
				${cell("Supplier", h.supplier)}
				${cell("Outstanding", fc(data.outstanding))}
			</div>
		</div>`;

	// line-by-line
	let line_rows = "";
	(data.lines || []).forEach((l) => {
		const pass = l.result === "PASS";
		line_rows += `<tr>
			<td>${l.line}</td>
			<td>${frappe.utils.escape_html(l.description || "")}</td>
			<td class="text-right">${fq(l.po_qty)}</td>
			<td class="text-right">${fq(l.gr_qty)}</td>
			<td class="text-right">${fq(l.inv_qty)}</td>
			<td class="text-center">${tick(l.qty_match)}</td>
			<td class="text-right">${fc(l.po_price)}</td>
			<td class="text-right">${fc(l.inv_price)}</td>
			<td class="text-right">${fc(l.variance)}</td>
			<td class="text-center">${tick(l.price_match)}</td>
			<td class="text-right">${fc(l.po_total)}</td>
			<td class="text-right">${fc(l.inv_total)}</td>
			<td style="font-weight:700;color:${pass ? "#137333" : "#c5221f"};">${l.result}</td>
		</tr>`;
	});
	const line_table = `
		${band("LINE-BY-LINE MATCH DETAIL")}
		<table class="table table-bordered" style="font-size:12px;margin-bottom:0;">
			<thead><tr style="background:#9a2a23;color:#fff;">
				<th>Line</th><th>Description</th>
				<th class="text-right">PO Qty</th><th class="text-right">GR Qty</th><th class="text-right">Inv Qty</th><th class="text-center">Qty</th>
				<th class="text-right">PO Price</th><th class="text-right">Inv Price</th><th class="text-right">Variance</th><th class="text-center">Price</th>
				<th class="text-right">PO Total</th><th class="text-right">Inv Total</th><th>Result</th>
			</tr></thead>
			<tbody>${line_rows}
				<tr style="background:#fdecea;font-weight:700;">
					<td colspan="10">TOTAL</td>
					<td class="text-right">${fc(data.totals.po_total)}</td>
					<td class="text-right">${fc(data.totals.inv_total)}</td>
					<td style="color:${data.totals.match ? "#137333" : "#c5221f"};">${data.totals.match ? "MATCH" : "DIFF"}</td>
				</tr>
			</tbody>
		</table>`;

	// tolerance + checks
	const tol_rows = (data.tolerances || [])
		.map((t) => status_row(t.control, t.setting, t.result, t.status, t.ok))
		.join("");
	const chk_rows = (data.checks || [])
		.map((c) => status_row(c.control, c.detail, c.result, c.status, c.ok))
		.join("");
	const controls = `
		${band("TOLERANCE CONFIGURATION & RESULTS")}
		<table class="table table-bordered" style="font-size:12px;">
			<thead><tr style="background:#f3e0dd;"><th>Control</th><th>Setting</th><th>Result</th><th>Status</th></tr></thead>
			<tbody>${tol_rows}${chk_rows}</tbody>
		</table>`;

	const next = `
		<div style="background:${h.approved ? "#0b8043" : "#b06000"};color:#fff;padding:8px 12px;font-size:12px;font-weight:600;">
			■ NEXT ACTION: ${frappe.utils.escape_html(data.next_action)}${h.approved ? " — payment ready (Net 30)" : ""}
		</div>`;

	dialog.fields_dict.report_html.$wrapper.html(
		`<div style="font-family:-apple-system,system-ui,sans-serif;">${header}${line_table}${controls}${next}</div>`
	);

	// proceed-to-payment action (warn but allow on mismatch)
	dialog.set_primary_action(__("Proceed to Payment"), () => {
		const go = () => proceed_to_payment(frm, dialog);
		if (!data.header.approved) {
			frappe.confirm(
				__("The three-way match did <b>not</b> fully pass. Proceed to payment anyway?"),
				go
			);
		} else {
			go();
		}
	});
	if (data.outstanding <= 0) dialog.get_primary_btn().hide();
}

function proceed_to_payment(frm, dialog) {
	frappe.call({
		method: `${TWM_METHOD}.create_payment_entry`,
		args: { purchase_invoice: frm.doc.name },
		freeze: true,
		freeze_message: __("Creating Payment Entry..."),
		callback(r) {
			if (r.message && r.message.name) {
				dialog.hide();
				frappe.show_alert({ message: r.message.message, indicator: "green" }, 5);
				frappe.set_route("Form", "Payment Entry", r.message.name);
			}
		},
	});
}

// ---- small html helpers ----
function cell(label, value, raw) {
	return `<div style="background:#fff;padding:6px 10px;">
		<div class="text-muted" style="font-size:10px;text-transform:uppercase;">${label}</div>
		<div style="font-size:13px;font-weight:600;">${raw ? value : frappe.utils.escape_html(value || "—")}</div>
	</div>`;
}
function band(text) {
	return `<div style="background:#9a2a23;color:#fff;padding:5px 10px;font-size:12px;font-weight:700;margin-top:12px;">■ ${text}</div>`;
}
function status_row(control, setting, result, status, ok) {
	const color = ok ? "#137333" : "#c5221f";
	return `<tr>
		<td style="font-weight:600;">${frappe.utils.escape_html(control)}</td>
		<td>${frappe.utils.escape_html(setting || "")}</td>
		<td>${frappe.utils.escape_html(String(result ?? ""))}</td>
		<td style="color:${color};font-weight:600;">${frappe.utils.escape_html(status || "")} <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${color};"></span></td>
	</tr>`;
}
