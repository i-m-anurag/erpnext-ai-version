# Copyright (c) 2026, Anurag and contributors
# For license information, please see license.txt
#
# Server-side gateway to the (external) Collatio API. ERPNext calls these
# whitelisted methods; they forward to the real/mock backend. Doing the HTTP
# call server-side keeps the backend URL in site_config (env-driven) and avoids
# browser CORS.
#
# Config keys (site_config.json / env via Docker):
#   collatio_api_url      base URL, e.g. http://10.1.0.4:8000   (no trailing /)
#   collatio_client_name  upload form "clientName"  (default ScryAPI)
#   collatio_app_name     upload form "appName"     (default ERPSystems_7811)

import frappe
from frappe import _

DEFAULT_BASE = "http://10.1.0.4:8000"


def _base():
	return (frappe.conf.get("collatio_api_url") or DEFAULT_BASE).rstrip("/")


def reconcile_three_way(purchase_invoice=None):
	"""POST /collatio/validate-and-reconcile and return the parsed JSON.

	Returns None when no API URL is configured, so the Three-Way Match button
	can fall back to the local link-traversal computation on a plain dev site.
	"""
	if not frappe.conf.get("collatio_api_url"):
		return None

	import requests

	url = f"{_base()}/collatio/validate-and-reconcile"
	resp = requests.post(url, json={"purchase_invoice": purchase_invoice}, timeout=30)
	resp.raise_for_status()
	return resp.json()


@frappe.whitelist()
def upload_and_download(file_url, document_type="Purchase Requisition"):
	"""Forward an uploaded file to /collatio/upload-and-download as multipart.

	`file_url` is the URL of a File already attached via the dialog. We read its
	bytes and re-post them with the clientName / appName / documentType fields.
	"""
	import requests

	if not file_url:
		frappe.throw(_("No file was provided."))

	file_doc = frappe.get_doc("File", {"file_url": file_url})
	content = file_doc.get_content()
	filename = file_doc.file_name or "upload.pdf"

	data = {
		"clientName": frappe.conf.get("collatio_client_name") or "ScryAPI",
		"appName": frappe.conf.get("collatio_app_name") or "ERPSystems_7811",
		"documentType": document_type or "Purchase Requisition",
	}
	resp = requests.post(
		f"{_base()}/collatio/upload-and-download",
		files={"file": (filename, content)},
		data=data,
		timeout=120,
	)
	resp.raise_for_status()
	return resp.json()
