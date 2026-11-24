import { HttpException, HttpStatus } from '@nestjs/common';

export class AccountSuspendedException extends HttpException {
  constructor(message = 'Account is suspended or banned. Please contact support.') {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'ACCOUNT_SUSPENDED',
        message,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class AccountLockedException extends HttpException {
  constructor(lockoutUntil: Date) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'ACCOUNT_LOCKED',
        message: `Account is temporarily locked due to consecutive failed attempts. Try again after ${lockoutUntil.toISOString()}.`,
        lockoutUntil,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class InvalidActiveRoleException extends HttpException {
  constructor(requestedRole: string) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'INVALID_ACTIVE_ROLE',
        message: `The active role '${requestedRole}' is not authorized for this user account.`,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class CompromisedTokenFamilyException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'TOKEN_COMPROMISED',
        message: 'Security violation: Refresh token reuse detected. All active sessions have been revoked.',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class ResourceOwnershipException extends HttpException {
  constructor(message = 'Access denied: You do not own this resource.') {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'RESOURCE_OWNERSHIP_DENIED',
        message,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
