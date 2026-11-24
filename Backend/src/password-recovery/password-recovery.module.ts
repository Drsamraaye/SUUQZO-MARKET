import { Module } from '@nestjs/common';
import { PasswordRecoveryService } from './password-recovery.service.js';
import { PasswordService } from '../security/password.service.js';
import { SessionsModule } from '../sessions/sessions.module.js';

@Module({
  imports: [SessionsModule],
  providers: [PasswordRecoveryService, PasswordService],
  exports: [PasswordRecoveryService],
})
export class PasswordRecoveryModule {}
