import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { safeEqualStr } from './security-utils';

@Injectable()
export class McpTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const expected = this.config.getOrThrow<string>('MCP_TOKEN');

    const provided = this.extractToken(req);
    if (!provided || !safeEqualStr(provided, expected)) {
      throw new UnauthorizedException('Invalid or missing MCP token');
    }
    return true;
  }

  private extractToken(req: Request): string | null {
    const q = req.query?.token;
    if (typeof q === 'string' && q.length) return q;

    const auth = req.headers['authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice('Bearer '.length).trim();
    }

    const header = req.headers['x-mcp-token'];
    if (typeof header === 'string' && header.length) return header;

    return null;
  }
}
