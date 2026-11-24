import { Module } from '@nestjs/common';
import { StoresService } from './stores.service.js';
import { StoresController } from './stores.controller.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
