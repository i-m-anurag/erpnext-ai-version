# Copyright (c) 2026, Anurag and contributors
# For license information, please see license.txt
#
# Global email redirect — a single switch to route ALL outgoing email to one
# address (e.g. for testing, so real users are never accidentally emailed).
#
# Enable by adding ONE key to the site's site_config.json:
#     "email_redirect_to": "you@example.com"
# Remove the key (or set it empty) to disable. Set it once with:
#     bench --site <site> set-config email_redirect_to you@example.com
#
# Hooked on Email Queue (the funnel every outgoing email passes through), so it
# covers notifications, workflow alerts, password resets, sendmail — everything.

import frappe


def redirect_recipients(doc, method=None):
	override = (frappe.conf.get("email_redirect_to") or "").strip()
	if not override:
		return  # disabled — normal delivery

	# Replace every recipient with the single override address.
	doc.set("recipients", [{"recipient": override}])

	# Drop CC/BCC so nothing leaks to the original addresses.
	if doc.meta.has_field("show_as_cc"):
		doc.show_as_cc = ""
	for field in ("cc", "bcc"):
		if doc.get(field):
			doc.set(field, "")
