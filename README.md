# gcal-mcp

Local MCP server that aggregates Google Calendar events from multiple Google accounts into a single interface for Claude.

## Setup

### 1. Create Google Cloud OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable the **Google Calendar API**
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Application type: **Web application**
6. Add authorized redirect URI: `http://localhost:3456/auth/callback`
7. Copy the Client ID and Client Secret

### 2. Configure Environment

```bash
cp .env.example .env
```

Fill in your `.env`:
```
DATABASE_URL=postgresql://localhost:5433/gcal_mcp
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
ENCRYPTION_KEY=<32-character-random-string>
APP_PORT=3456
APP_URL=http://localhost:3456
```

Generate an encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### 3. Create Database

```bash
createdb -p 5433 gcal_mcp
```

### 4. Build & Start

```bash
npm install
npm run build
pm2 start ecosystem.config.js
```

Or for development:
```bash
npm run start:dev
```

### 5. Connect Google Accounts

Open http://localhost:3456/auth/add and authorize each Google account.

### 6. Add MCP to Claude

Copy the contents of `claude_mcp_config.json` into your Claude MCP settings:

```json
{
  "mcpServers": {
    "gcal-multi": {
      "url": "http://localhost:3456/mcp/sse"
    }
  }
}
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `gcal_list_accounts` | List all connected accounts with status |
| `gcal_list_calendars` | List calendars (all or filtered by account) |
| `gcal_list_events` | List events across accounts, sorted by time |
| `gcal_create_event` | Create event in specific account/calendar |
| `gcal_update_event` | Update existing event |
| `gcal_delete_event` | Delete event |
| `gcal_get_event` | Get full event details |
| `gcal_find_free_slots` | Find free time slots across accounts |

## Management

- **Accounts UI**: http://localhost:3456/accounts
- **Add account**: http://localhost:3456/auth/add
- **Logs**: `pm2 logs gcal-mcp`
- **Restart**: `pm2 restart gcal-mcp`
- **Stop**: `pm2 stop gcal-mcp`
