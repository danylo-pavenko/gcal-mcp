# gcal-mcp

Self-hosted MCP server that aggregates **Google Calendar**, **Gmail**, and
**Google Tasks** across multiple Google accounts into one interface for Claude.

Designed to run as a persistent HTTPS service under PM2 + Nginx on an Ubuntu
server, exposed to Claude over SSE at `https://<your-domain>/mcp/sse`.

---

## Features

- Multi-account: one server, many Google accounts. Every tool accepts an
  optional `accountEmail` filter — omit it to fan-out across all active
  accounts.
- OAuth tokens encrypted at rest (AES-256-CBC). Access tokens auto-refresh
  before each API call.
- Persistent HTTP transport (SSE) so Claude CoWork keeps a stable connection —
  no ngrok warning page, no tunnel drops.

### MCP Tools

**Google Calendar**

| Tool | Description |
|------|-------------|
| `gcal_list_accounts` | List all connected accounts with status |
| `gcal_list_calendars` | List calendars (all or filtered by account) |
| `gcal_list_events` | List events across accounts, sorted by time |
| `gcal_get_event` | Get full event details |
| `gcal_create_event` | Create event in specific account/calendar |
| `gcal_update_event` | Update existing event |
| `gcal_delete_event` | Delete event |
| `gcal_find_free_slots` | Find free time slots across accounts |

**Gmail**

| Tool | Description |
|------|-------------|
| `gmail_list_messages` | List/search messages |
| `gmail_get_message` | Full message with headers and body |
| `gmail_get_thread` | Full thread with all messages |
| `gmail_list_labels` | List labels for an account |
| `gmail_modify_labels` | Add / remove labels on a message |
| `gmail_send_email` | Send an email from a connected account |

**Google Tasks**

| Tool | Description |
|------|-------------|
| `gtasks_list_tasklists` | List task lists |
| `gtasks_list_tasks` | List tasks in a list |
| `gtasks_create_task` | Create task |
| `gtasks_update_task` | Update task fields |
| `gtasks_complete_task` | Mark task complete |
| `gtasks_delete_task` | Delete task |
| `gtasks_move_task` | Move / reorder task |

---

## Architecture

NestJS app on port **3456** serving two roles:

1. **MCP server** — SSE transport at `/mcp/sse`.
2. **Web UI** — plain HTML pages at `/accounts` and `/auth/add` for OAuth
   account management.

Module layout:

- `accounts/` — TypeORM entity + CRUD for stored OAuth tokens (AES encrypted).
- `auth/` — Google OAuth2 flow; `/auth/add`, `/auth/callback`.
- `calendar/`, `gmail/`, `tasks/` — Google API wrappers with retry +
  exponential backoff for rate limits.
- `mcp/` — MCP server (`@modelcontextprotocol/sdk`) with SSE transport and
  session management. Tool schemas defined with zod.
- `config/` — database config, OAuth client factory, AES helpers.

PostgreSQL on port **5433**, database `gcal_mcp`, single table
`google_accounts`.

---

## Google Cloud setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or reuse one).
3. Enable the **Google Calendar API**, **Gmail API**, and **Google Tasks API**.
4. **Credentials → Create Credentials → OAuth client ID** → Web application.
5. Authorized redirect URIs:
   - `http://localhost:3456/auth/callback` (local dev)
   - `https://<your-domain>/auth/callback` (production)
6. Save the Client ID and Client Secret for the `.env` step.

---

## Production deploy (Ubuntu)

Three scripts live in `scripts/`. Each is idempotent — safe to re-run.

### First-time setup

```bash
# 1. Clone the repo onto the server (as the deploy user, NOT root).
git clone <repo-url> ~/apps/gcal-mcp
cd ~/apps/gcal-mcp

# 2. Create the DB role + database on the existing PostgreSQL instance
#    (port 5433, shared with other apps). Writes credentials to .env.db.
sudo ./scripts/setup-db.sh

# 3. Build .env from the three sources:
#      .env.example   → scaffold of required keys
#      .env.db        → DATABASE_URL (written by step 2)
#      .env.secrets   → ENCRYPTION_KEY (written on first deploy.sh run)
cp .env.example .env
# then edit .env: paste DATABASE_URL, Google creds, APP_PORT=3456,
# APP_URL=https://gcal-mcp.pavenko.com, and a 32-hex ENCRYPTION_KEY.

# 4. Install deps, build, start under PM2.
./scripts/deploy.sh
# On the very first run it generates .env.secrets with an ENCRYPTION_KEY and
# exits — copy that key into .env, then run deploy.sh again.

# 5. Configure nginx + Let's Encrypt for the public domain.
sudo DOMAIN=gcal-mcp.pavenko.com EMAIL=you@example.com \
  ./scripts/setup-nginx-certbot.sh

# 6. Enable PM2 boot persistence (only once per server). Run the command
#    that 'pm2 startup' prints:
pm2 startup
pm2 save
```

### Re-deploy

After pushing new commits:

```bash
cd ~/apps/gcal-mcp
./scripts/deploy.sh
```

`pm2 startOrReload` performs a zero-downtime reload.

### Script reference

| Script | Runs as | Purpose |
|--------|---------|---------|
| `scripts/setup-db.sh` | root (via sudo) | Create role + database on port 5433. Writes `.env.db`. `--rotate` resets the password. |
| `scripts/deploy.sh` | deploy user | `git pull`, `npm ci`, `npm run build`, `pm2 startOrReload`. Verifies `.env` keys. |
| `scripts/setup-nginx-certbot.sh` | root (via sudo) | Installs nginx + certbot, writes a vhost with SSE-friendly proxy settings, obtains/renews TLS cert. Does not touch UFW or other sites. |

---

## Local development

```bash
npm install
createdb -p 5433 gcal_mcp
cp .env.example .env   # set ENCRYPTION_KEY, Google creds, APP_URL=http://localhost:3456
npm run start:dev
```

Open http://localhost:3456/auth/add to authorize accounts.

---

## Claude MCP configuration

**Production**

```json
{
  "mcpServers": {
    "gcal-multi": {
      "url": "https://gcal-mcp.pavenko.com/mcp/sse"
    }
  }
}
```

**Local**

```json
{
  "mcpServers": {
    "gcal-multi": {
      "url": "http://localhost:3456/mcp/sse"
    }
  }
}
```

---

## Management

- Accounts UI: `https://<your-domain>/accounts`
- Add account: `https://<your-domain>/auth/add`
- Logs: `pm2 logs gcal-mcp`
- Restart: `pm2 restart gcal-mcp`
- Stop: `pm2 stop gcal-mcp`

---

## Troubleshooting SSE

If Claude CoWork disconnects or never receives events:

1. **Check the upstream directly** on the server — bypass nginx:
   `curl -N http://127.0.0.1:3456/mcp/sse` (should stream `event:` lines).
2. **Verify nginx buffering is off** — the vhost must set `proxy_buffering off`
   and `X-Accel-Buffering: no`. Both are in `scripts/setup-nginx-certbot.sh`.
3. **Inspect `proxy_read_timeout`** — if idle connections drop after a few
   minutes, the vhost value (`24h`) was overridden somewhere upstream.
4. **Watch nginx error log** during a reconnect attempt:
   `sudo tail -f /var/log/nginx/error.log`.
5. **PM2 app alive?** — `pm2 status gcal-mcp` and `pm2 logs gcal-mcp --lines 200`.
