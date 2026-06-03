# Copyright (c) 2026, Anurag and contributors
# For license information, please see license.txt
#
# Outgoing-email routing controlled by single site_config keys (driven by env
# vars in Docker via the entrypoint). Hooked on Email Queue before_insert, so it
# covers EVERY outgoing email: workflow approval alerts, notifications, password
# resets, sendmail.
#
#   email_copy_to     -> ADD this address as an extra recipient. Both the real
#                        recipient(s) (e.g. the approver) AND this monitor
#                        address receive every email.  (env: EMAIL_COPY_TO)
#
#   email_redirect_to -> REPLACE all recipients with this single address. Real
#                        users are never emailed — for safe testing. Takes
#                        precedence over email_copy_to.  (env: EMAIL_REDIRECT_TO)
#
# Set neither -> normal delivery.

import frappe


def apply_email_routing(doc, method=None):
	redirect_to = (frappe.conf.get("email_redirect_to") or "").strip()
	copy_to = (frappe.conf.get("email_copy_to") or "").strip()

	# Redirect (replace) wins — used for testing, never email real users.
	if redirect_to:
		doc.set("recipients", [{"recipient": redirect_to}])
		_clear_cc_bcc(doc)
		return

	# Copy (add) — the real recipients PLUS the monitor address.
	if copy_to:
		existing = {r.recipient for r in doc.get("recipients", [])}
		if copy_to not in existing:
			doc.append("recipients", {"recipient": copy_to})


def _clear_cc_bcc(doc):
	if doc.meta.has_field("show_as_cc"):
		doc.show_as_cc = ""
	for field in ("cc", "bcc"):
		if doc.get(field):
			doc.set(field, "")
