import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
}
