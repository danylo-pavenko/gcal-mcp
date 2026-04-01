import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { GmailModule } from '../gmail/gmail.module';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';

@Module({
  imports: [CalendarModule, GmailModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
