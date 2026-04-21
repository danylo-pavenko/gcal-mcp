import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { McpService } from './mcp.service';
import { McpTokenGuard } from '../security/mcp-token.guard';

@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('sse')
  @UseGuards(McpTokenGuard)
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
