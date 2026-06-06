# Copyright (c) 2026, Anurag and contributors
# For license information, please see license.txt

BRAND = "IQ-SMART ERP"

# Every bundled app -> unified brand for the desk sidebar subtitle.
BRANDED_APPS = {"frappe", "erpnext", "hrms", "india_compliance", "ai_procurement"}

# Relabel desk-home grid tiles / popups (desktop icons) to drop vendor names.
ICON_RELABEL = {"Frappe HR": "HR"}


def extend_bootinfo(bootinfo):
	"""White-label the desk.

	- Sidebar subtitle reads boot.app_data[].app_title (raw) -> unify to BRAND.
	- The /desk home grid + popup read boot.desktop_icons[].label / .parent_icon
	  (raw) -> relabel vendor names (e.g. "Frappe HR" -> "HR"), keeping child
	  icons grouped under the new label.

	Both fields are sent un-translated, so a Translation can't reach them.
	"""
	for app in bootinfo.get("app_data") or []:
		if app.get("app_name") in BRANDED_APPS:
			app["app_title"] = BRAND

	for icon in bootinfo.get("desktop_icons") or []:
		if icon.get("label") in ICON_RELABEL:
			icon["label"] = ICON_RELABEL[icon["label"]]
		if icon.get("parent_icon") in ICON_RELABEL:
			icon["parent_icon"] = ICON_RELABEL[icon["parent_icon"]]
