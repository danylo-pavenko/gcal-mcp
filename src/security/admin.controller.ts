import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import {
  ADMIN_COOKIE_NAME,
  hashAdminPassword,
  safeEqualStr,
} from './security-utils';

@Controller()
export class AdminAuthController {
  constructor(private readonly config: ConfigService) {}

  @Get('/')
  root(@Req() req: Request, @Res() res: Response) {
    res.redirect('/accounts');
  }

  @Get('login')
  loginPage(
    @Query('redirect') redirect: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const safeRedirect = this.sanitizeRedirect(redirect);
    const errorBlock = error
      ? `<div class="error">Incorrect password.</div>`
      : '';
    res.type('html').send(`<!DOCTYPE html>
<html><head><title>Sign in — Google Calendar MCP</title>
<style>
  body { font-family: system-ui; max-width: 420px; margin: 100px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { margin-bottom: 6px; }
  p.sub { color: #666; margin-top: 0; margin-bottom: 24px; }
  form { display: flex; flex-direction: column; gap: 12px; }
  input[type=password] { padding: 10px 12px; font-size: 15px; border: 1px solid #ccc; border-radius: 4px; }
  button { padding: 10px 16px; background: #4285f4; color: white; border: none; border-radius: 4px; font-size: 15px; cursor: pointer; }
  button:hover { background: #3367d6; }
  .error { background: #fdecea; color: #b71c1c; padding: 10px 12px; border-radius: 4px; font-size: 14px; margin-bottom: 12px; }
</style></head>
<body>
  <h1>Sign in</h1>
  <p class="sub">Enter the admin password to manage accounts.</p>
  ${errorBlock}
  <form method="POST" action="/login">
    <input type="hidden" name="redirect" value="${this.escapeHtml(safeRedirect)}" />
    <input type="password" name="password" placeholder="Password" autofocus required />
    <button type="submit">Sign in</button>
  </form>
</body></html>`);
  }

  @Post('login')
  loginSubmit(
    @Body('password') password: string,
    @Body('redirect') redirect: string | undefined,
    @Res() res: Response,
  ) {
    const expected = this.config.getOrThrow<string>('ADMIN_PASSWORD');
    const safeRedirect = this.sanitizeRedirect(redirect);

    if (!password || !safeEqualStr(password, expected)) {
      return res.redirect(
        `/login?error=1&redirect=${encodeURIComponent(safeRedirect)}`,
      );
    }

    const key = this.config.getOrThrow<string>('ENCRYPTION_KEY');
    const cookieValue = hashAdminPassword(expected, key);
    const secure = this.config
      .get<string>('APP_URL', '')
      .startsWith('https://');
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    res.setHeader(
      'Set-Cookie',
      `${ADMIN_COOKIE_NAME}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`,
    );
    res.redirect(safeRedirect);
  }

  @Get('logout')
  logout(@Res() res: Response) {
    res.setHeader(
      'Set-Cookie',
      `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    res.redirect('/login');
  }

  private sanitizeRedirect(value: string | undefined): string {
    if (!value) return '/accounts';
    if (!value.startsWith('/') || value.startsWith('//')) return '/accounts';
    return value;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
