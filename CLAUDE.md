# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm run build          # Compile TypeScript
npm run start:dev      # Dev mode with watch
npm run start:prod     # Production (requires build first)
pm2 start ecosystem.config.js   # PM2 production
pm2 logs gcal-mcp      # View logs
```

## Architecture

NestJS app serving two roles on port 3456:
1. **MCP Server** (SSE transport at `/mcp/sse`) — exposes Google Calendar tools to Claude
2. **Web UI** — simple HTML pages for OAuth account management

### Module Structure

- `accounts/` — GoogleAccount entity (TypeORM/PostgreSQL), CRUD for stored OAuth tokens. Tokens are AES-256 encrypted at rest.
- `auth/` — Google OAuth2 flow (googleapis). Handles `/auth/add` and `/auth/callback`. Auto-refreshes expired tokens before any API call.
- `calendar/` — Wrapper around Google Calendar API. All methods accept optional `accountEmail` filter; without it, they operate across all active accounts. Includes retry with exponential backoff for rate limits.
- `mcp/` — MCP server using `@modelcontextprotocol/sdk`. SSE transport with session management. Tools defined in `mcp/tools/calendar.tools.ts` using zod schemas.
- `config/` — Database config, Google OAuth client factory, AES encryption helpers.

### Key Design Decisions

- Multi-account: every calendar operation iterates over all active accounts unless filtered by `accountEmail`
- Token storage: access_token and refresh_token encrypted with AES-256-CBC, IV prepended to ciphertext
- MCP transport: SSE (not stdio) so it runs as a persistent HTTP service
- Database: TypeORM with `synchronize: true` (auto-migration, suitable for local dev)

## Database

PostgreSQL on port 5433, database `gcal_mcp`. Single table `google_accounts`.

## Environment

Required in `.env`: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ENCRYPTION_KEY` (32 hex chars), `APP_PORT`, `APP_URL`.
