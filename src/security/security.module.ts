import { Global, Module } from '@nestjs/common';
import { AdminAuthController } from './admin.controller';
import { AdminAuthGuard } from './admin-auth.guard';
import { McpTokenGuard } from './mcp-token.guard';

@Global()
@Module({
  controllers: [AdminAuthController],
  providers: [AdminAuthGuard, McpTokenGuard],
  exports: [AdminAuthGuard, McpTokenGuard],
})
export class SecurityModule {}
