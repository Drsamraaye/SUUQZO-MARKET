import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppRequest, AuthenticatedUser } from '../interfaces/request-context.interface.js';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AppRequest>();
    const user = request.user;
    return data && user ? user[data] : user;
  },
);

export const ActiveRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AppRequest>();
    return request.activeRole;
  },
);
