import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AdminUsersController } from './admin-users.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  controllers: [AuthController, AdminUsersController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [AuthService],
})
export class AuthModule {}
