import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

export function createOAuth2Client(configService: ConfigService) {
  return new google.auth.OAuth2(
    configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
    configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
    `${configService.getOrThrow<string>('APP_URL')}/auth/callback`,
  );
}

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];
