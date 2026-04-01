import { Controller, Get, Delete, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  private readonly appUrl: string;

  constructor(
    private readonly accountsService: AccountsService,
    private readonly configService: ConfigService,
  ) {
    this.appUrl = this.configService.getOrThrow<string>('APP_URL');
  }

  @Get()
  async listAccounts(@Res() res: Response) {
    const accounts = await this.accountsService.findAll();
    const sseUrl = `${this.appUrl}/mcp/sse`;
    const rows = accounts
      .map(
        (a) => `
      <tr>
        <td>${a.email}</td>
        <td>${a.label}</td>
        <td>${a.is_active ? '✅ Active' : '❌ Inactive'}</td>
        <td>${a.token_expiry.toISOString()}</td>
        <td style="white-space:nowrap">
          <a href="/auth/add" style="color:#4285f4;margin-right:12px;text-decoration:none;font-size:14px">Re-auth</a>
          <button onclick="if(confirm('Remove ${a.email}?')) fetch('/accounts/${a.id}', {method:'DELETE'}).then(()=>location.reload())"
                  style="color:red;cursor:pointer;border:1px solid red;background:none;padding:4px 8px;border-radius:4px;font-size:13px">
            Remove
          </button>
        </td>
      </tr>`,
      )
      .join('');

    res.type('html').send(`<!DOCTYPE html>
<html><head><title>Google Calendar MCP — Accounts</title>
<style>
  body { font-family: system-ui; max-width: 960px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { margin-bottom: 4px; }
  .subtitle { color: #666; margin-top: 0; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }
  th { background: #f5f5f5; }
  .btn { display: inline-block; margin-top: 20px; padding: 10px 20px; color: white; text-decoration: none; border-radius: 4px; }
  .btn-primary { background: #4285f4; }
  .btn-primary:hover { background: #3367d6; }
  .setup-box { margin-top: 36px; background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; }
  .setup-box h2 { margin-top: 0; font-size: 18px; }
  .setup-box h3 { font-size: 15px; margin-bottom: 6px; color: #333; }
  .setup-box p, .setup-box li { font-size: 14px; color: #555; line-height: 1.6; }
  .setup-box ol { padding-left: 20px; }
  .setup-box ol > li { margin-bottom: 12px; }
  pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 13px; position: relative; }
  .copy-btn { position: absolute; top: 8px; right: 8px; background: #444; color: #ccc; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
  .copy-btn:hover { background: #666; }
  .copy-btn.copied { background: #2e7d32; color: white; }
  .tag { display: inline-block; background: #e8f0fe; color: #1967d2; font-size: 12px; padding: 2px 8px; border-radius: 3px; font-weight: 500; }
  .divider { border: none; border-top: 1px solid #e0e0e0; margin: 28px 0; }
</style></head>
<body>
  <h1>Google Calendar MCP</h1>
  <p class="subtitle">Multi-account calendar integration for Claude</p>

  <h2>Connected Accounts</h2>
  <table>
    <thead><tr><th>Email</th><th>Label</th><th>Status</th><th>Token Expiry</th><th>Actions</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">No accounts connected yet.</td></tr>'}</tbody>
  </table>
  <a href="/auth/add" class="btn btn-primary">+ Add Google Account</a>

  <div class="setup-box">
    <h2>Connect to Claude CoWork</h2>
    <p>Add this MCP server as a custom connector in Claude CoWork to give Claude access to your Google Calendars.</p>

    <ol>
      <li>
        <h3>Open CoWork Settings</h3>
        <p>In Claude CoWork, go to <strong>Settings</strong> → <strong>Connectors</strong> → <strong>Add Connector</strong> → <strong>Custom MCP</strong></p>
      </li>
      <li>
        <h3>Enter the SSE URL</h3>
        <p>Paste this URL as the MCP server endpoint:</p>
        <pre id="sse-url-block"><code>${sseUrl}</code><button class="copy-btn" onclick="copyText('${sseUrl}', this)">Copy</button></pre>
      </li>
      <li>
        <h3>Or use JSON config</h3>
        <p>If your client supports JSON config, use:</p>
        <pre id="json-config-block"><code>{
  "mcpServers": {
    "gcal-multi": {
      "url": "${sseUrl}"
    }
  }
}</code><button class="copy-btn" onclick="copyJson(this)">Copy</button></pre>
      </li>
      <li>
        <h3>Verify connection</h3>
        <p>Once connected, Claude will have access to <strong>${accounts.length}</strong> account(s) and these tools:</p>
        <p>
          <span class="tag">gcal_list_accounts</span>
          <span class="tag">gcal_list_calendars</span>
          <span class="tag">gcal_list_events</span>
          <span class="tag">gcal_create_event</span>
          <span class="tag">gcal_update_event</span>
          <span class="tag">gcal_delete_event</span>
          <span class="tag">gcal_get_event</span>
          <span class="tag">gcal_find_free_slots</span>
        </p>
      </li>
    </ol>

    <hr class="divider">
    <h3>Claude Code (CLI)</h3>
    <p>Add to your <code>~/.claude/settings.json</code> or project <code>.claude/settings.local.json</code>:</p>
    <pre id="cli-config-block"><code>"mcpServers": {
  "gcal-multi": {
    "url": "${sseUrl}"
  }
}</code><button class="copy-btn" onclick="copyCli(this)">Copy</button></pre>
  </div>

  <script>
    function copyText(text, btn) {
      navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    }
    function copyJson(btn) {
      const json = JSON.stringify({ mcpServers: { "gcal-multi": { url: "${sseUrl}" } } }, null, 2);
      navigator.clipboard.writeText(json);
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    }
    function copyCli(btn) {
      const text = document.getElementById('cli-config-block').querySelector('code').textContent;
      navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    }
  </script>
</body></html>`);
  }

  @Delete(':id')
  async removeAccount(@Param('id') id: string) {
    await this.accountsService.remove(id);
    return { ok: true };
  }
}
