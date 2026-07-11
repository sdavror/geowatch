import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TokenPayload } from './jwt.util';
import type { AuthedRequest } from './jwt-auth.guard';

/** Injects the authenticated user's token payload into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TokenPayload | undefined => {
    return ctx.switchToHttp().getRequest<AuthedRequest>().user;
  },
);
