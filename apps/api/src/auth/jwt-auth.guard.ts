import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { verifyToken, TokenPayload } from './jwt.util';

export interface AuthedRequest extends Request {
  user?: TokenPayload;
}

/** Verifies the Bearer access token and attaches its payload to req.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length);
    const payload = verifyToken(token, this.config.get<string>('JWT_SECRET')!);
    if (!payload || payload.type !== 'access') {
      throw new UnauthorizedException('Invalid or expired token');
    }
    req.user = payload;
    return true;
  }
}
