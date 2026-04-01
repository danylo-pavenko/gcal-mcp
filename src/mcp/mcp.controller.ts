import { Controller, Get, Post, Req, Res, Query } from '@nestjs/common';
import { Request, Response } from 'express';
import { McpService } from './mcp.service';

@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('sse')
  async sseEndpoint(@Req() req: Request, @Res() res: Response) {
    await this.mcpService.handleSseConnection(req, res);
  }

  @Post('messages')
  async messageEndpoint(
    @Req() req: Request,
    @Res() res: Response,
    @Query('sessionId') sessionId: string,
  ) {
    await this.mcpService.handleMessage(req, res, sessionId, req.body);
  }
}
