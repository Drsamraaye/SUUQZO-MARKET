import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service.js';
import { InventoryController } from './inventory.controller.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
