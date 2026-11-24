import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { TwoFactorService } from '../two-factor/two-factor.service.js';
import { PasswordRecoveryService } from '../password-recovery/password-recovery.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { TwoFactorConfirmDto } from './dto/two-factor-confirm.dto.js';
import { TwoFactorDisableDto } from './dto/two-factor-disable.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { Request } from 'express';

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
    private readonly passwordRecoveryService: PasswordRecoveryService,
  ) {}

  // ─── PUBLIC ROUTES ────────────────────────────

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Public()
  @Post('verify-phone')
  @HttpCode(HttpStatus.OK)
  verifyPhone(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyPhone(dto.target, dto.code);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.passwordRecoveryService.createPasswordResetToken(dto.identifier);
    // AUDIT FIX: Never leak raw password reset tokens in HTTP response
    return {
      message: 'If an account exists with this identifier, a password reset token has been issued.',
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordRecoveryService.resetPassword(dto.token, dto.newPassword);
  }

  // ─── AUTHENTICATED ROUTES ─────────────────────

  @Get('me')
  @HttpCode(HttpStatus.OK)
  me(@CurrentUser() user: { id: string }) {
    return this.authService.me(user.id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @CurrentUser() user: { id: string; sessionId: string },
    @Body() dto: Partial<RefreshTokenDto>,
  ) {
    return this.authService.logout(user.id, user.sessionId, dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  logoutAll(@CurrentUser() user: { id: string }) {
    return this.authService.logoutAllDevices(user.id);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.passwordRecoveryService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  // ─── 2FA ROUTES ───────────────────────────────

  @Post('2fa/enroll')
  @HttpCode(HttpStatus.OK)
  twoFactorEnroll(@CurrentUser() user: { id: string }) {
    return this.twoFactorService.enroll(user.id);
  }

  @Post('2fa/confirm')
  @HttpCode(HttpStatus.OK)
  twoFactorConfirm(
    @CurrentUser() user: { id: string },
    @Body() dto: TwoFactorConfirmDto,
  ) {
    return this.twoFactorService.confirmEnrollment(user.id, dto.code);
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  twoFactorDisable(
    @CurrentUser() user: { id: string },
    @Body() dto: TwoFactorDisableDto,
  ) {
    return this.twoFactorService.disable(user.id, dto.password);
  }
}
