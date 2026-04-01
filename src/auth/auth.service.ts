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
      refreshToken: tokens.refresh_token!,
      expiryDate: tokens.expiry_date!,
    });
  }

  async getAuthenticatedClient(account: GoogleAccount): Promise<OAuth2Client> {
    const client = createOAuth2Client(this.configService);
    const accessToken = this.accountsService.decryptAccessToken(account);
    const refreshToken = this.accountsService.decryptRefreshToken(account);

    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: account.token_expiry.getTime(),
    });

    if (account.token_expiry.getTime() < Date.now() + 60_000) {
      this.logger.log(`Refreshing token for ${account.email}`);
      try {
        const { credentials } = await client.refreshAccessToken();
        client.setCredentials(credentials);
        await this.accountsService.updateTokens(
          account.id,
          credentials.access_token!,
          credentials.expiry_date!,
        );
      } catch (err) {
        this.logger.error(`Failed to refresh token for ${account.email}`, err);
        throw err;
      }
    }

    return client;
  }
}
