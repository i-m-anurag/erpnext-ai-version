# Copyright (c) 2026, Anurag and contributors
# For license information, please see license.txt

BRAND = "IQ-SMART ERP"


def extend_bootinfo(bootinfo):
	"""Rebrand the app title shown in the desk sidebar.

	Frappe sends the sidebar app title (boot.app_data[].app_title) RAW — it is
	not passed through the translation system — so a Translation alone can't
	rename it. We rewrite it here on every boot.
	"""
	for app in bootinfo.get("app_data") or []:
		if app.get("app_title") == "ERPNext":
			app["app_title"] = BRAND
