# ============================================================================
# ERPNext v16 + AI Procurement — all-in-one bench image
# Base: Ubuntu 24.04 -> Python 3.14 -> bench -> frappe + erpnext + ai_procurement
#
# Build context is the REPO ROOT (this app). Build with:
#   docker compose build           # from the deploy/ folder
#   # or:  docker build -f deploy/Dockerfile -t erpnext-ai .   # from repo root
# ============================================================================
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    NODE_VERSION=24 \
    FRAPPE_BRANCH=version-16 \
    ERPNEXT_BRANCH=version-16

# ---------------------------------------------------------------------------
# 1. System dependencies
#    - Python 3.14 via deadsnakes (Ubuntu 24.04 ships 3.12)
#    - Node 24 + yarn (Frappe v16 requires node >= 24)
#    - build tools, cron (bench backup setup), db/redis clients, wkhtmltopdf
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl wget gnupg git software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
        python3.14 python3.14-venv python3.14-dev \
        python3 python3-pip \
        build-essential pkg-config cron \
        libffi-dev libssl-dev default-libmysqlclient-dev \
        mariadb-client redis-tools \
        xfonts-75dpi xfonts-base fonts-cantarell \
        libxrender1 libxext6 fontconfig \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g yarn \
    && WK_ARCH="$(dpkg --print-architecture)" \
    && wget -q "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.jammy_${WK_ARCH}.deb" \
    && apt-get install -y "./wkhtmltox_0.12.6.1-3.jammy_${WK_ARCH}.deb" \
    && rm -f "wkhtmltox_0.12.6.1-3.jammy_${WK_ARCH}.deb" \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# 2. Non-root user (Frappe refuses to run as root)
# ---------------------------------------------------------------------------
RUN useradd -ms /bin/bash frappe
USER frappe
WORKDIR /home/frappe
ENV PATH="/home/frappe/.local/bin:${PATH}"

# ---------------------------------------------------------------------------
# 3. Install the bench CLI (runs under system python; the FRAPPE env uses 3.14)
# ---------------------------------------------------------------------------
RUN pip3 install --user --break-system-packages frappe-bench

# ---------------------------------------------------------------------------
# 4. Initialize the bench + frappe (skip redis cfg; redis is external)
# ---------------------------------------------------------------------------
RUN bench init \
        --skip-redis-config-generation \
        --frappe-branch ${FRAPPE_BRANCH} \
        --python python3.14 \
        frappe-bench
WORKDIR /home/frappe/frappe-bench

# ---------------------------------------------------------------------------
# 5. Pull ERPNext
# ---------------------------------------------------------------------------
RUN bench get-app --branch ${ERPNEXT_BRANCH} erpnext

# ---------------------------------------------------------------------------
# 6. Copy + register the custom app from the repo root (build context).
#    The whole repo is copied in, then the deploy/ folder (docker files) is
#    removed so only the Frappe app remains. apps.txt is rewritten with
#    guaranteed newlines so it never glues onto the previous entry.
# ---------------------------------------------------------------------------
COPY --chown=frappe:frappe . apps/ai_procurement
RUN rm -rf apps/ai_procurement/deploy \
    && ./env/bin/pip install -e apps/ai_procurement \
    && ( grep -qxF 'ai_procurement' sites/apps.txt 2>/dev/null \
         || printf '%s\n' "$(cat sites/apps.txt)" 'ai_procurement' > sites/apps.txt )

# ---------------------------------------------------------------------------
# 7. Build JS/CSS assets for all apps
# ---------------------------------------------------------------------------
RUN bench build

# ---------------------------------------------------------------------------
# 8. Runtime entrypoint + slimmed Procfile (no redis/watch processes)
# ---------------------------------------------------------------------------
COPY --chown=frappe:frappe deploy/Procfile /home/frappe/frappe-bench/Procfile
COPY --chown=frappe:frappe deploy/docker-entrypoint.sh /home/frappe/entrypoint.sh
USER root
RUN chmod +x /home/frappe/entrypoint.sh
USER frappe

EXPOSE 8000 9000
ENTRYPOINT ["/home/frappe/entrypoint.sh"]
CMD ["start"]
