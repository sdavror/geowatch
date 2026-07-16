import { Controller, Get, UseGuards } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { TokenPayload } from '../auth/jwt.util';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor') // superadmin passes via RolesGuard's owner bypass
export class AdminDashboardController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get('stats')
  stats(@CurrentUser() user: TokenPayload) {
    return this.articlesService.dashboardStats(user.sub);
  }
}
