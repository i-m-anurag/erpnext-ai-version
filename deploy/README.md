# Docker Deployment — ERPNext v16 + AI Procurement

This folder ships an all-in-one custom image (Ubuntu 24.04 → Python 3.14 → bench →
frappe + erpnext + **this app**) orchestrated with Docker Compose alongside MariaDB
and Redis. Front it with your own external Nginx + manual TLS certificates.

> The build context is the **repo root** — the custom app is baked straight from
> this repository into the image (no separate git fetch needed).

## Layout

```
<repo root>/                # the Frappe app (pyproject.toml, ai_procurement/ ...)
├── .dockerignore           # trims build context; removes app's deploy/ copy
└── deploy/
    ├── Dockerfile
    ├── docker-entrypoint.sh # runtime: configure → wait → create site → migrate → start
    ├── Procfile             # bench processes (no redis/watch; redis is external)
    ├── docker-compose.yml   # app + db + redis-cache + redis-queue (context: ..)
    ├── .env.example         # copy to .env and fill secrets
    ├── nginx/erpnext.conf   # sample for YOUR host nginx
    └── README.md            # this file
```

## Prerequisites (on the server — Ubuntu or CentOS)

- Docker Engine + Docker Compose v2
  - Ubuntu: `apt install docker-ce docker-compose-plugin`
  - CentOS: `dnf install docker-ce docker-compose-plugin`
- A domain pointing at the server + TLS certs you manage
- Open ports 80/443 (Ubuntu `ufw` / CentOS `firewall-cmd`)

> **Architecture:** build the image **on the target server** so it matches the
> server's CPU (the Dockerfile auto-selects amd64/arm64). Don't copy an image
> built on a different architecture.

## Deploy

```bash
# 1. Clone this repo onto the server
git clone <your-repo-url> ai_procurement
cd ai_procurement/deploy

# 2. Configure secrets
cp .env.example .env && nano .env        # set SITE_NAME + passwords

# 3. Build the image (first build ~10–20 min: pulls frappe+erpnext, builds assets)
docker compose build

# 4. Start the stack. On first run the entrypoint creates the site and installs
#    erpnext + ai_procurement automatically.
docker compose up -d
docker compose logs -f app                # watch until web is listening

# 5. Wire up your external nginx + certs
#    Ubuntu: /etc/nginx/sites-available/ (+ symlink)   CentOS: /etc/nginx/conf.d/
sudo cp nginx/erpnext.conf /etc/nginx/conf.d/erpnext.conf   # adjust per distro
#    put certs at /etc/ssl/erp/{fullchain.pem,privkey.pem} (or edit paths)
sudo nginx -t && sudo systemctl reload nginx
```

Then open `https://<SITE_NAME>` and log in as `Administrator` / `ADMIN_PASSWORD`.

## Verify the AI Procurement feature

1. Open a **submitted** Material Request.
2. **Create → PO OCR** → the upload popup appears.
3. Upload a PO → comparison table renders → **Save Validation**.

## Updating the app

```bash
git pull                       # pull new app code
docker compose build app       # rebuild image
docker compose up -d app       # entrypoint auto-runs `bench migrate`
```

## Day-2 operations

| Task             | Command                                                              |
|------------------|----------------------------------------------------------------------|
| Logs             | `docker compose logs -f app`                                         |
| Bench shell      | `docker compose exec app bash`                                       |
| Backup (w/files) | `docker compose exec app bench --site $SITE_NAME backup --with-files`|
| Restart app      | `docker compose restart app`                                         |
| Stop (keep data) | `docker compose down`                                                |
| Wipe everything  | `docker compose down -v`                                             |

## Notes

- **Python 3.14** via deadsnakes PPA; **Node 24** (both required by Frappe v16).
- **wkhtmltopdf** is downloaded per-architecture, so the image builds natively on
  amd64 servers and arm64 (Apple Silicon) alike.
- **`--mariadb-user-host-login-scope='%'`** lets the site DB user connect to
  MariaDB over TCP between containers.
- Single-server, all-in-one setup. For horizontal scaling, migrate to the
  official multi-container `frappe_docker` layout later.
