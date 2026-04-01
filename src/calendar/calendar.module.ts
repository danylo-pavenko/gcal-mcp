import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { CalendarService } from './calendar.service';

@Module({
  imports: [AccountsModule, AuthModule],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
