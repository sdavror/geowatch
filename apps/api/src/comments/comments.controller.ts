import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { TokenPayload } from '../auth/jwt.util';

class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

// Public reads live under /articles/:id/comments; writes require auth.
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('articles/:id/comments')
  list(@Param('id') articleId: string) {
    return this.commentsService.listForArticle(articleId);
  }

  @Post('articles/:id/comments')
  @UseGuards(JwtAuthGuard)
  create(
    @Param('id') articleId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.commentsService.create(articleId, user.sub, dto.body);
  }

  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() user: TokenPayload) {
    return this.commentsService.remove(id, user.sub, user.role);
  }

  @Get('admin/comments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('editor') // superadmin passes via RolesGuard's owner bypass
  adminList(@Query('limit') limit?: string) {
    return this.commentsService.listRecent(Number(limit) || 100);
  }

  @Delete('admin/comments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('editor')
  adminRemove(@Param('id') id: string) {
    return this.commentsService.removeAsModerator(id);
  }
}
