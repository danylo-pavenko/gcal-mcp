import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { GmailService } from './gmail.service';

@Module({
  imports: [AccountsModule, AuthModule],
  providers: [GmailService],
  exports: [GmailService],
})
export class GmailModule {}
