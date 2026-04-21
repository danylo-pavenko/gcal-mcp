#!/usr/bin/env bash
# setup-nginx-certbot.sh — idempotent nginx vhost + Let's Encrypt cert for
# gcal-mcp.pavenko.com. This server hosts other apps in nginx too, so we:
#   - NEVER touch /etc/nginx/nginx.conf or other sites-*.
#   - Only reload nginx (not restart) after nginx -t passes.
#   - Skip certbot if a live cert for the domain already exists (avoids the
#     5 duplicates/week Let's Encrypt rate limit).
#   - Do NOT add UFW rules.
#
# SSE note: the upstream (NestJS MCP server on 127.0.0.1:3456) streams
# events on /mcp/sse. The vhost disables buffering and extends proxy_read_timeout
# so events flow in real time and long-lived connections are not cut off.

set -euo pipefail

DOMAIN="${DOMAIN:-gcal-mcp.pavenko.com}"
EMAIL="${EMAIL:-}"
UPSTREAM="${UPSTREAM:-127.0.0.1:3456}"
SITE_NAME="gcal-mcp"

SITES_AVAILABLE="/etc/nginx/sites-available"
SITES_ENABLED="/etc/nginx/sites-enabled"
SITE_CONF="$SITES_AVAILABLE/$SITE_NAME"
LIVE_CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

usage() {
  cat <<EOF
Usage: sudo DOMAIN=gcal-mcp.pavenko.com EMAIL=you@example.com $0

Environment variables (or CLI-exported):
  DOMAIN     FQDN for the vhost (default: gcal-mcp.pavenko.com)
  EMAIL      Email for Let's Encrypt account (required for first cert)
  UPSTREAM   Backend host:port (default: 127.0.0.1:3456)

Must be run as root.
EOF
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 0; }

log()  { printf '\033[1;34m==> [%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '\033[1;33m==> [WARN]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m==> [ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

trap 'die "failed at line $LINENO"' ERR

[[ $EUID -eq 0 ]] || die "must run as root"

# --- Install packages (idempotent via dpkg) -----------------------------------

apt_install() {
  local pkg="$1"
  if ! dpkg -s "$pkg" >/dev/null 2>&1; then
    log "installing $pkg"
    DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg"
  fi
}

if ! command -v nginx >/dev/null || ! command -v certbot >/dev/null; then
  log "apt-get update"
  apt-get update -qq
fi
apt_install nginx
apt_install certbot
apt_install python3-certbot-nginx

[[ -d "$SITES_AVAILABLE" ]] || die "$SITES_AVAILABLE not found — unexpected nginx layout"

# --- Write vhost (HTTP-only; certbot --nginx will add the TLS server block) ---

TMP_CONF="$(mktemp)"
cat > "$TMP_CONF" <<EOF
# Managed by scripts/setup-nginx-certbot.sh
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # Allow large OAuth redirect payloads / SSE reconnect preambles.
    client_max_body_size 10m;

    location / {
        proxy_pass http://$UPSTREAM;
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;

        # SSE: keep the connection open and flush events immediately.
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
        chunked_transfer_encoding on;
        add_header X-Accel-Buffering no always;
    }
}
EOF

if [[ -f "$SITE_CONF" ]] && cmp -s "$TMP_CONF" "$SITE_CONF"; then
  log "vhost $SITE_CONF already up to date"
  rm -f "$TMP_CONF"
else
  log "writing vhost $SITE_CONF"
  mv "$TMP_CONF" "$SITE_CONF"
  chmod 644 "$SITE_CONF"
fi

# Enable via symlink (ln -sf is safe on repeat).
if [[ ! -L "$SITES_ENABLED/$SITE_NAME" ]]; then
  log "enabling site"
  ln -sf "$SITE_CONF" "$SITES_ENABLED/$SITE_NAME"
fi

log "nginx -t"
nginx -t

log "reloading nginx"
systemctl reload nginx

# --- Certbot (only if we don't already have a live cert) ----------------------

if [[ -d "$LIVE_CERT_DIR" ]]; then
  log "live cert already present at $LIVE_CERT_DIR — skipping certbot issue"
else
  [[ -n "$EMAIL" ]] || die "EMAIL env var required to request a new cert"
  log "requesting cert for $DOMAIN via certbot --nginx"
  certbot --nginx \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    -m "$EMAIL" \
    --redirect
fi

# --- Verify renewal timer -----------------------------------------------------

if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q enabled; then
  log "certbot.timer is enabled — automatic renewal OK"
else
  log "enabling certbot.timer"
  systemctl enable --now certbot.timer
fi

log "done. Test with: curl -I https://$DOMAIN/"
