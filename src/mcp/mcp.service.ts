import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { IncomingMessage, ServerResponse } from 'http';
import { CalendarService } from '../calendar/calendar.service';
import { GmailService } from '../gmail/gmail.service';
import { registerCalendarTools } from './tools/calendar.tools';
import { registerGmailTools } from './tools/gmail.tools';

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private transports = new Map<string, SSEServerTransport>();

  constructor(
    private readonly calendarService: CalendarService,
    private readonly gmailService: GmailService,
  ) {}

  private createMcpServer(): McpServer {
    const server = new McpServer(
      { name: 'gcal-multi', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    registerCalendarTools(server, this.calendarService);
    registerGmailTools(server, this.gmailService);
    return server;
  }

  async handleSseConnection(req: IncomingMessage, res: ServerResponse) {
    const transport = new SSEServerTransport('/mcp/messages', res);
    this.transports.set(transport.sessionId, transport);
    this.logger.log(`SSE connection established: ${transport.sessionId}`);

    transport.onclose = () => {
      this.transports.delete(transport.sessionId);
      this.logger.log(`SSE connection closed: ${transport.sessionId}`);
    };

    const server = this.createMcpServer();
    await server.connect(transport);
  }

  async handleMessage(
    req: IncomingMessage,
    res: ServerResponse,
    sessionId: string,
    body: unknown,
  ) {
    const transport = this.transports.get(sessionId);
    if (!transport) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    await transport.handlePostMessage(req, res, body);
  }
}
