import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
