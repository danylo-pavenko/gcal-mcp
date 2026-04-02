import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { TasksService } from './tasks.service';

@Module({
  imports: [AccountsModule, AuthModule],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
