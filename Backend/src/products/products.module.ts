import { Module } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
