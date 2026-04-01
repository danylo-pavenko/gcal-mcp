import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('APP_PORT', 3456);
  const logger = new Logger('Bootstrap');

  // Disable body parsing for MCP SSE endpoint (handled by transport)
  app.enableCors();

  await app.listen(port);
  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`Accounts UI: http://localhost:${port}/accounts`);
  logger.log(`MCP SSE endpoint: http://localhost:${port}/mcp/sse`);
}
bootstrap();
