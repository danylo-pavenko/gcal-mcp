import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, oauth2_v2 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { AccountsService } from '../accounts/accounts.service';
import { GoogleAccount } from '../accounts/account.entity';
import { createOAuth2Client, GOOGLE_SCOPES } from '../config/google.config';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly oauth2Client: OAuth2Client;
  private readonly refreshInFlight = new Map<string, Promise<{ access_token: string; refresh_token: string | null; expiry_date: number }>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly accountsService: AccountsService,
  ) {
    this.oauth2Client = createOAuth2Client(this.configService);
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
    });
  }

  async handleCallback(code: string): Promise<GoogleAccount> {
    const client = createOAuth2Client(this.configService);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: userInfo } = await oauth2.userinfo.get();

    const email = userInfo.email!;
    const label = userInfo.name || email;

    return this.accountsService.upsertAccount({
      email,
      label,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? undefined,
      expiryDate: tokens.expiry_date!,
    });
  }

  async getAuthenticatedClient(account: GoogleAccount): Promise<OAuth2Client> {
    const needsRefresh = account.token_expiry.getTime() < Date.now() + 5 * 60_000;

    let creds: { access_token: string; refresh_token: string | null; expiry_date: number };

    if (needsRefresh) {
      let inFlight = this.refreshInFlight.get(account.id);
      if (!inFlight) {
        inFlight = this.doRefresh(account).finally(() => {
          this.refreshInFlight.delete(account.id);
        });
        this.refreshInFlight.set(account.id, inFlight);
      }
      creds = await inFlight;
    } else {
      creds = {
        access_token: this.accountsService.decryptAccessToken(account),
        refresh_token: this.accountsService.decryptRefreshToken(account),
        expiry_date: account.token_expiry.getTime(),
      };
    }

    const client = createOAuth2Client(this.configService);
    client.setCredentials(creds);
    return client;
  }

  private async doRefresh(account: GoogleAccount): Promise<{ access_token: string; refresh_token: string | null; expiry_date: number }> {
    this.logger.log(`Refreshing token for ${account.email}`);

    const client = createOAuth2Client(this.configService);
    client.setCredentials({
      access_token: this.accountsService.decryptAccessToken(account),
      refresh_token: this.accountsService.decryptRefreshToken(account),
      expiry_date: account.token_expiry.getTime(),
    });

    try {
      const { credentials } = await client.refreshAccessToken();
      await this.accountsService.updateTokens(
        account.id,
        credentials.access_token!,
        credentials.expiry_date!,
        credentials.refresh_token ?? undefined,
      );
      return {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token ?? null,
        expiry_date: credentials.expiry_date!,
      };
    } catch (err: any) {
      const isInvalidGrant =
        err?.response?.data?.error === 'invalid_grant' ||
        err?.message?.includes('invalid_grant');
      if (isInvalidGrant) {
        this.logger.error(`Refresh token revoked for ${account.email}, deactivating account`);
        await this.accountsService.deactivateAccount(account.id);
      }
      this.logger.error(`Failed to refresh token for ${account.email}`, err);
      throw err;
    }
  }
}
