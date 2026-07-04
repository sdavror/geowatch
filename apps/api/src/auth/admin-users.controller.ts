import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { IsIn } from 'class-validator';
import type { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';
import type { TokenPayload } from './jwt.util';

class UpdateRoleDto {
  @IsIn(['superadmin', 'editor', 'viewer'])
  role!: UserRole;
}

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AdminUsersController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  list() {
    return this.authService.listUsers();
  }

  @Patch(':id/role')
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: TokenPayload,
  ) {
    return this.authService.updateRole(id, dto.role, actor.sub);
  }
}
