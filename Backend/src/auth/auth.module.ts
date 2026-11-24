import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SecurityModule } from '../security/security.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { OtpModule } from '../otp/otp.module.js';
import { TwoFactorModule } from '../two-factor/two-factor.module.js';
import { PasswordRecoveryModule } from '../password-recovery/password-recovery.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [
    SecurityModule,
    SessionsModule,
    OtpModule,
    TwoFactorModule,
    PasswordRecoveryModule,
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
