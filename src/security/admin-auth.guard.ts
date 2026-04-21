import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import {
  ADMIN_COOKIE_NAME,
  hashAdminPassword,
  readCookie,
  safeEqualHex,
} from './security-utils';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const password = this.config.getOrThrow<string>('ADMIN_PASSWORD');
    const key = this.config.getOrThrow<string>('ENCRYPTION_KEY');
    const expected = hashAdminPassword(password, key);

    const provided = readCookie(req.headers.cookie, ADMIN_COOKIE_NAME);
    if (provided && safeEqualHex(provided, expected)) return true;

    const redirectTo = encodeURIComponent(req.originalUrl || '/accounts');
    res.redirect(`/login?redirect=${redirectTo}`);
    return false;
  }
}
