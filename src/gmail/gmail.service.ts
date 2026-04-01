import { Injectable, Logger } from '@nestjs/common';
import { google, gmail_v1 } from 'googleapis';
import { AccountsService } from '../accounts/accounts.service';
import { AuthService } from '../auth/auth.service';
import { GoogleAccount } from '../accounts/account.entity';

interface EmailMessage {
  id: string;
  threadId: string;
  accountEmail: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body?: string;
  labels: string[];
  isUnread: boolean;
}

interface EmailThread {
  id: string;
  accountEmail: string;
  subject: string;
  snippet: string;
  messagesCount: number;
  lastDate: string;
  participants: string[];
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private readonly accountsService: AccountsService,
    private readonly authService: AuthService,
  ) {}

  private async getGmailClient(account: GoogleAccount): Promise<gmail_v1.Gmail> {
    const auth = await this.authService.getAuthenticatedClient(account);
    return google.gmail({ version: 'v1', auth });
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (err?.code === 429 && attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(`Rate limited, retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Unreachable');
  }

  private async getTargetAccounts(accountEmail?: string): Promise<GoogleAccount[]> {
    if (accountEmail) {
      const account = await this.accountsService.findByEmail(accountEmail);
      if (!account) throw new Error(`Account not found: ${accountEmail}`);
      return [account];
    }
    return this.accountsService.findActive();
  }

  private parseHeader(
    headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
    name: string,
  ): string {
    return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
  }

  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
    if (!payload) return '';

    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }

    if (payload.parts) {
      const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        return Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
      }
      const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
      if (htmlPart?.body?.data) {
        const html = Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8');
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      for (const part of payload.parts) {
        const nested = this.extractBody(part);
        if (nested) return nested;
      }
    }

    return '';
  }

  private parseMessage(
    msg: gmail_v1.Schema$Message,
    accountEmail: string,
    includeBody: boolean,
  ): EmailMessage {
    const headers = msg.payload?.headers;
    const result: EmailMessage = {
      id: msg.id!,
      threadId: msg.threadId!,
      accountEmail,
      from: this.parseHeader(headers, 'From'),
      to: this.parseHeader(headers, 'To'),
      subject: this.parseHeader(headers, 'Subject'),
      date: this.parseHeader(headers, 'Date'),
      snippet: msg.snippet ?? '',
      labels: msg.labelIds ?? [],
      isUnread: msg.labelIds?.includes('UNREAD') ?? false,
    };
    if (includeBody) {
      result.body = this.extractBody(msg.payload);
    }
    return result;
  }

  // Parallel fetch: all accounts in parallel, all message details in parallel per account
  async listMessages(params: {
    accountEmail?: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
  }): Promise<EmailMessage[]> {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const maxPerAccount = Math.min(params.maxResults ?? 20, 50);

    const accountResults = await Promise.all(
      accounts.map(async (account) => {
        try {
          const gmail = await this.getGmailClient(account);

          const { data } = await this.withRetry(() =>
            gmail.users.messages.list({
              userId: 'me',
              q: params.query,
              maxResults: maxPerAccount,
              labelIds: params.labelIds,
            }),
          );

          const items = data.messages ?? [];
          if (items.length === 0) return [];

          // Fetch all message metadata in parallel
          const messages = await Promise.all(
            items.map((item) =>
              this.withRetry(() =>
                gmail.users.messages.get({
                  userId: 'me',
                  id: item.id!,
                  format: 'metadata',
                  metadataHeaders: ['From', 'To', 'Subject', 'Date'],
                }),
              ).then(({ data: msg }) => this.parseMessage(msg, account.email, false)),
            ),
          );

          return messages;
        } catch (err) {
          this.logger.warn(`Failed to list messages for ${account.email}: ${err}`);
          return [];
        }
      }),
    );

    return accountResults
      .flat()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async getMessage(params: {
    accountEmail: string;
    messageId: string;
  }): Promise<EmailMessage> {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const gmail = await this.getGmailClient(accounts[0]);

    const { data: msg } = await this.withRetry(() =>
      gmail.users.messages.get({
        userId: 'me',
        id: params.messageId,
        format: 'full',
      }),
    );

    return this.parseMessage(msg, params.accountEmail, true);
  }

  async getThread(params: {
    accountEmail: string;
    threadId: string;
  }): Promise<{ thread: EmailThread; messages: EmailMessage[] }> {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const gmail = await this.getGmailClient(accounts[0]);

    const { data } = await this.withRetry(() =>
      gmail.users.threads.get({
        userId: 'me',
        id: params.threadId,
        format: 'full',
      }),
    );

    const messages = (data.messages ?? []).map((msg) =>
      this.parseMessage(msg, params.accountEmail, true),
    );

    const participants = new Set<string>();
    messages.forEach((m) => {
      participants.add(m.from);
      m.to.split(',').forEach((t) => participants.add(t.trim()));
    });

    return {
      thread: {
        id: data.id!,
        accountEmail: params.accountEmail,
        subject: messages[0]?.subject ?? '',
        snippet: data.snippet ?? '',
        messagesCount: messages.length,
        lastDate: messages[messages.length - 1]?.date ?? '',
        participants: [...participants],
      },
      messages,
    };
  }

  async sendEmail(params: {
    accountEmail: string;
    to: string[];
    subject: string;
    body: string;
    cc?: string[];
    bcc?: string[];
    replyToMessageId?: string;
    threadId?: string;
  }): Promise<{ id: string; threadId: string }> {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const gmail = await this.getGmailClient(accounts[0]);

    const headers = [
      `From: ${params.accountEmail}`,
      `To: ${params.to.join(', ')}`,
      ...(params.cc?.length ? [`Cc: ${params.cc.join(', ')}`] : []),
      ...(params.bcc?.length ? [`Bcc: ${params.bcc.join(', ')}`] : []),
      `Subject: ${params.subject}`,
      ...(params.replyToMessageId
        ? [`In-Reply-To: ${params.replyToMessageId}`, `References: ${params.replyToMessageId}`]
        : []),
      'Content-Type: text/html; charset=utf-8',
      '',
      params.body,
    ];

    const raw = Buffer.from(headers.join('\r\n')).toString('base64url');

    const { data } = await this.withRetry(() =>
      gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw, threadId: params.threadId },
      }),
    );

    return { id: data.id!, threadId: data.threadId! };
  }

  async modifyLabels(params: {
    accountEmail: string;
    messageId: string;
    addLabels?: string[];
    removeLabels?: string[];
  }): Promise<void> {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const gmail = await this.getGmailClient(accounts[0]);

    await this.withRetry(() =>
      gmail.users.messages.modify({
        userId: 'me',
        id: params.messageId,
        requestBody: {
          addLabelIds: params.addLabels,
          removeLabelIds: params.removeLabels,
        },
      }),
    );
  }

  async listLabels(accountEmail: string): Promise<{ id: string; name: string; type: string }[]> {
    const accounts = await this.getTargetAccounts(accountEmail);
    const gmail = await this.getGmailClient(accounts[0]);

    const { data } = await this.withRetry(() =>
      gmail.users.labels.list({ userId: 'me' }),
    );

    return (data.labels ?? []).map((l) => ({
      id: l.id!,
      name: l.name!,
      type: l.type ?? 'user',
    }));
  }
}
