# White-Labeling ERPNext

Complete rebranding of ERPNext (name, logo, loader/splash, favicon, emails,
print, PWA). Two layers: **no-code UI settings** (fast) and **a custom app with
`hooks.py`** (thorough and upgrade-safe).

---

## A. No-code settings to check first

Search each in the awesome-bar (`Ctrl/Cmd+K`):

| Setting | Controls |
|---|---|
| **Navbar Settings** | Top-left **Application Logo**, logo width, and the **Help / Settings dropdown items** (remove the Frappe/ERPNext docs/about links) |
| **Website Settings** | **App Name**, **Brand HTML**, **Banner Image**, **Favicon**, **Splash Image**, **Footer logo/items**, **Copyright**, hide the **Frappe/ERPNext footer signature**, and **PWA** name + icons (mobile home-screen) |
| **System Settings** | **App Name** (window title / "Login to …") and **disable standard email footer** |
| **Letter Head** | Logo + header/footer on **printed PDFs** (POs, invoices) |
| **Website Theme** | Brand colors / fonts for the public website |

---

## B. Element → where to change it (full checklist)

| Visible element | No-code | Code (hooks / CSS) |
|---|---|---|
| **App name** ("Login to Frappe", browser tab) | Website Settings → *App Name*; System Settings | `app_title` |
| **Navbar logo** (top-left) | Navbar Settings → *Application Logo* | `app_logo_url` |
| **Desk loader / splash logo** | *(uses the app logo)* | `app_logo_url` |
| **Login page logo** | *(uses the app logo)* | `app_logo_url` |
| **Favicon** (tab icon) | Website Settings → *Favicon* | `website_context["favicon"]` |
| **Loader spinner color/style** | — | `app_include_css` |
| **"Powered by ERPNext" footer** | Website Settings → hide footer signature | `website_context` |
| **Public website brand / banner** | Website Settings → *Brand HTML / Banner* | `website_context["brand_html"]` |
| **Email branding / footer** | System Settings / Email → disable standard footer | `mail_footer` |
| **Print / PDF logo** | Letter Head | — |
| **PWA / mobile app icon & name** | Website Settings → PWA | `website_context` |
| **Theme colors** | Website Theme | `website_theme_scss` / custom CSS |

> The single most impactful hook is **`app_logo_url`** — it rebrands the navbar
> logo, the desk **splash/loader**, *and* the login page logo at once.

---

## C. The thorough way — a small white-label app (recommended)

Keep branding in a dedicated app (or your existing `ai_procurement`) so it's
version-controlled and survives `bench update`. In `hooks.py`:

```python
app_logo_url = "/assets/yourbrand/images/logo.svg"   # navbar + splash + login

app_include_css = "/assets/yourbrand/css/whitelabel.css"
app_include_js  = "/assets/yourbrand/js/whitelabel.js"

website_context = {
    "favicon": "/assets/yourbrand/images/favicon.png",
    "splash_image": "/assets/yourbrand/images/splash.png",
    "brand_html": "<img src='/assets/yourbrand/images/logo.svg' height='28'>",
}
```

Drop `logo.svg`, `favicon.png`, `splash.png` into `yourbrand/public/images/`,
use `whitelabel.css` to recolor the loader spinner / hide residual "Frappe"
text / restyle the login page, then `bench build && bench --site <site> clear-cache`.

For stray hardcoded "Frappe"/"ERPNext" strings, you can also override them with a
**custom translation** (`Frappe → YourBrand`) — handy but use sparingly.

---

## D. Licensing caveat

Frappe and ERPNext are **GPLv3**. Rebranding/white-labeling is **allowed** (the
"Powered by" toggles exist precisely for this), but stay license-compliant: keep
the `license.txt`/copyright files, and if you distribute or run it as SaaS, honor
the GPL/AGPL source-availability terms. Removing the *visible* branding is fine;
stripping the license/copyright files is not.
