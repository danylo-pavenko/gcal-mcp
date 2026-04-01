import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GmailService } from '../../gmail/gmail.service';

export function registerGmailTools(mcp: McpServer, gmailService: GmailService) {
  mcp.tool(
    'gmail_list_messages',
    'Lists email messages across ALL accounts in one call — returns sender, subject, date, snippet and unread status. Do NOT call this multiple times per account; one call covers all. Use gmail_get_message only when you need the full body of a specific email.',
    {
      accountEmail: z.string().optional().describe('Filter by account email. Omit to search across ALL accounts.'),
      query: z.string().optional().describe('Gmail search query, e.g. "is:unread", "from:boss@company.com", "subject:invoice after:2026-03-01"'),
      maxResults: z.number().optional().describe('Max messages per account (default 20, max 50)'),
      labelIds: z.array(z.string()).optional().describe('Filter by label IDs e.g. ["INBOX"], ["UNREAD"], ["SENT"]'),
    },
    async (params) => {
      const messages = await gmailService.listMessages(params);
      return { content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }] };
    },
  );

  mcp.tool(
    'gmail_get_message',
    'Gets the FULL content of a single email including body. Only call this when you need to read the actual message body — use gmail_list_messages first to find the messageId.',
    {
      accountEmail: z.string().describe('Account email that owns this message'),
      messageId: z.string().describe('Gmail message ID (from gmail_list_messages result)'),
    },
    async (params) => {
      const message = await gmailService.getMessage(params);
      return { content: [{ type: 'text', text: JSON.stringify(message, null, 2) }] };
    },
  );

  mcp.tool(
    'gmail_get_thread',
    'Gets a full email thread with all messages and bodies. Use when the user wants to see an entire conversation. Prefer this over calling gmail_get_message multiple times.',
    {
      accountEmail: z.string().describe('Account email that owns this thread'),
      threadId: z.string().describe('Gmail thread ID (from gmail_list_messages result)'),
    },
    async (params) => {
      const result = await gmailService.getThread(params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  mcp.tool(
    'gmail_send_email',
    'Sends an email from a specified account. For replies, provide both replyToMessageId and threadId to keep the thread together.',
    {
      accountEmail: z.string().describe('Account to send from (must be one of the connected accounts)'),
      to: z.array(z.string()).describe('Recipient email addresses'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body (HTML supported, plain text also works)'),
      cc: z.array(z.string()).optional().describe('CC recipients'),
      bcc: z.array(z.string()).optional().describe('BCC recipients'),
      replyToMessageId: z.string().optional().describe('Original message ID to reply to'),
      threadId: z.string().optional().describe('Thread ID to add reply to the same conversation'),
    },
    async (params) => {
      const result = await gmailService.sendEmail(params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  mcp.tool(
    'gmail_modify_labels',
    'Adds or removes Gmail labels on a message. Common uses: mark as read (removeLabels: ["UNREAD"]), star (addLabels: ["STARRED"]), archive (removeLabels: ["INBOX"]).',
    {
      accountEmail: z.string().describe('Account email'),
      messageId: z.string().describe('Gmail message ID'),
      addLabels: z.array(z.string()).optional().describe('Label IDs to add'),
      removeLabels: z.array(z.string()).optional().describe('Label IDs to remove'),
    },
    async (params) => {
      await gmailService.modifyLabels(params);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    },
  );

  mcp.tool(
    'gmail_list_labels',
    'Lists all Gmail labels for an account. Call this only when you need label IDs for gmail_modify_labels or filtering. System labels: INBOX, UNREAD, SENT, DRAFT, STARRED, TRASH, SPAM.',
    {
      accountEmail: z.string().describe('Account email'),
    },
    async ({ accountEmail }) => {
      const labels = await gmailService.listLabels(accountEmail);
      return { content: [{ type: 'text', text: JSON.stringify(labels, null, 2) }] };
    },
  );
}
