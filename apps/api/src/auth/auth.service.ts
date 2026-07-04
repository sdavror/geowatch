import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { signToken, verifyToken } from './jwt.util';

const ACCESS_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private accessSecret() {
    return this.config.get<string>('JWT_SECRET')!;
  }
  private refreshSecret() {
    return this.config.get<string>('JWT_REFRESH_SECRET')!;
  }

  /**
   * Free registration for regular users. The very first account to register
   * becomes the owner (superadmin); everyone after is a viewer until an
   * admin promotes them to editor. This bootstraps ownership without a
   * hardcoded credential and keeps public sign-ups powerless by default.
   */
  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const userCount = await this.prisma.user.count();
    const role: UserRole = userCount === 0 ? 'superadmin' : 'viewer';
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: { email, passwordHash, role },
    });
    if (role === 'superadmin') {
      this.logger.log(`👑 First user ${email} registered as owner (superadmin)`);
    }
    return this.issueTokens(user.id, user.email, user.role);
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });
    return this.issueTokens(user.id, user.email, user.role);
  }

  async refresh(refreshToken: string) {
    const payload = verifyToken(refreshToken, this.refreshSecret());
    if (!payload || payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Account not found or disabled');
    }
    return this.issueTokens(user.id, user.email, user.role);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, active: true, lastLogin: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      ...user,
      lastLogin: user.lastLogin?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /** Change the current user's password after verifying the old one. */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    this.logger.log(`Password changed for ${user.email}`);
    return { success: true };
  }

  /** Admin: list all accounts (for approving editors). */
  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, role: true, active: true, lastLogin: true, createdAt: true },
    });
    return users.map((u) => ({
      ...u,
      lastLogin: u.lastLogin?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  /** Admin: change a user's role — this is how editors get approved. */
  async updateRole(userId: string, role: UserRole, actingUserId: string) {
    if (userId === actingUserId && role !== 'superadmin') {
      throw new ConflictException('You cannot demote your own owner account');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, role: true, active: true },
    });
    this.logger.log(`Role of ${user.email} set to ${role}`);
    return user;
  }

  private issueTokens(id: string, email: string, role: UserRole) {
    const accessToken = signToken(
      { sub: id, email, role, type: 'access' },
      this.accessSecret(),
      ACCESS_TTL_SECONDS,
    );
    const refreshToken = signToken(
      { sub: id, email, role, type: 'refresh' },
      this.refreshSecret(),
      REFRESH_TTL_SECONDS,
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TTL_SECONDS,
      user: { id, email, role },
    };
  }
}
