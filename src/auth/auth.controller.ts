import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('add')
  addAccount(@Res() res: Response) {
    res.type('html').send(`<!DOCTYPE html>
<html><head><title>Add Google Account</title>
<style>
  body { font-family: system-ui; max-width: 600px; margin: 80px auto; text-align: center; }
  a { display: inline-block; padding: 14px 28px; background: #4285f4; color: white; text-decoration: none; border-radius: 4px; font-size: 16px; }
  a:hover { background: #3367d6; }
</style></head>
<body>
  <h1>Add Google Account</h1>
  <p>Click below to authorize a Google account for calendar access.</p>
  <a href="${this.authService.getAuthUrl()}">Sign in with Google</a>
  <br><br>
  <a href="/accounts" style="background:#666;font-size:14px;padding:8px 16px;">← Back to accounts</a>
</body></html>`);
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    try {
      const account = await this.authService.handleCallback(code);
      res.type('html').send(`<!DOCTYPE html>
<html><head><title>Account Added</title>
<style>
  body { font-family: system-ui; max-width: 600px; margin: 80px auto; text-align: center; }
  .success { color: #2e7d32; }
  a { color: #4285f4; }
</style></head>
<body>
  <h1 class="success">Account Connected!</h1>
  <p><strong>${account.email}</strong> (${account.label}) has been connected successfully.</p>
  <p><a href="/accounts">View all accounts</a> | <a href="/auth/add">Add another account</a></p>
</body></html>`);
    } catch (err) {
      res.status(500).type('html').send(`<!DOCTYPE html>
<html><head><title>Error</title>
<style>body { font-family: system-ui; max-width: 600px; margin: 80px auto; text-align: center; } .error { color: #c62828; }</style></head>
<body>
  <h1 class="error">Authorization Failed</h1>
  <p>${err instanceof Error ? err.message : 'Unknown error'}</p>
  <p><a href="/auth/add">Try again</a></p>
</body></html>`);
    }
  }
}
