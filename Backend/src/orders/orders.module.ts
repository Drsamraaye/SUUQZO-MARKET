import { Module } from '@nestjs/common';
import {
  OrdersController,
  SellerOrdersController,
  AdminOrdersController,
} from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [
    OrdersController,
    SellerOrdersController,
    AdminOrdersController,
  ],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
