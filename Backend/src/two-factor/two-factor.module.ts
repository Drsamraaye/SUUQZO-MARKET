import { Module } from '@nestjs/common';
import { TwoFactorService } from './two-factor.service.js';
import { SecurityModule } from '../security/security.module.js';

@Module({
  imports: [SecurityModule],
  providers: [TwoFactorService],
  exports: [TwoFactorService],
})
export class TwoFactorModule {}
