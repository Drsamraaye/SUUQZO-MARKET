import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

// Database
import { PrismaModule } from './database/prisma.module.js';

// Security & Core Domain Modules
import { SecurityModule } from './security/security.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuditLogsModule } from './audit-logs/audit-logs.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { SellersModule } from './sellers/sellers.module.js';
import { StoresModule } from './stores/stores.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { BrandsModule } from './brands/brands.module.js';
import { ProductsModule } from './products/products.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { CartModule } from './cart/cart.module.js';
import { CheckoutModule } from './checkout/checkout.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';

// Guards
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './authorization/guards/roles.guard.js';
import { PermissionsGuard } from './authorization/guards/permissions.guard.js';

// Middleware
import { RequestContextMiddleware } from './middleware/request-context.middleware.js';
import { AuthenticationContextMiddleware } from './middleware/authentication-context.middleware.js';
import { RoleContextMiddleware } from './middleware/role-context.middleware.js';
import { SecurityHeadersMiddleware } from './middleware/security-headers.middleware.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    PrismaModule,
    SecurityModule,
    SessionsModule,
    UsersModule,
    AuthorizationModule,
    AuthModule,
    AuditLogsModule,
    NotificationsModule,
    SellersModule,
    StoresModule,
    CategoriesModule,
    BrandsModule,
    ProductsModule,
    InventoryModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'backend',
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global validation pipe — whitelist strips unknown fields
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    // Guard chain: JWT → Roles → Permissions (order matters)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        SecurityHeadersMiddleware,
        RequestContextMiddleware,
        AuthenticationContextMiddleware,
        RoleContextMiddleware,
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
