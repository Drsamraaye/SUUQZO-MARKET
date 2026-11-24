import { Module } from '@nestjs/common';
import { SellersService } from './sellers.service.js';
import { SellersController } from './sellers.controller.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [SellersController],
  providers: [SellersService],
  exports: [SellersService],
})
export class SellersModule {}
