import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import type { AuthedRequest } from './jwt-auth.guard';

/**
 * Runs after JwtAuthGuard. Allows the request only if req.user.role is in
 * the route's @Roles list. superadmin always passes (owner has all rights).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const role = req.user?.role as UserRole | undefined;
    if (role === 'superadmin') return true;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
