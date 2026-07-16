import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArticlesService } from './articles.service';
import { CreateArticleDto, UpdateArticleDto } from './dto/admin-article.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { TokenPayload } from '../auth/jwt.util';
import { imageUploadOptions, UploadedImage } from '../upload/upload.config';

const STATUSES = ['idea', 'draft', 'in_review', 'ready', 'scheduled', 'published', 'archived'];

@Controller('admin/articles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor') // superadmin passes via RolesGuard's owner bypass
export class AdminArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  list(
    @CurrentUser() user: TokenPayload,
    @Query('published') published?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('mine') mine?: string,
    @Query('tag') tag?: string,
  ) {
    return this.articlesService.findAllAdmin({
      published: published === undefined ? undefined : published === 'true',
      status: STATUSES.includes(status ?? '') ? (status as never) : undefined,
      q: q?.trim() || undefined,
      authorId: mine === 'true' ? user.sub : undefined,
      tag: tag?.trim() || undefined,
    });
  }

  @Get('counts')
  counts() {
    return this.articlesService.countAdmin();
  }

  @Get('calendar')
  calendar(@Query('year') year?: string, @Query('month') month?: string) {
    const now = new Date();
    const y = Number(year) || now.getUTCFullYear();
    const m = Number(month) || now.getUTCMonth() + 1;
    if (m < 1 || m > 12 || y < 2000 || y > 2100) {
      throw new BadRequestException('year/month out of range');
    }
    return this.articlesService.calendarMonth(y, m);
  }

  @Post()
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: TokenPayload) {
    return this.articlesService.create({ ...dto, authorId: user.sub });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.articlesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.articlesService.remove(id);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  upload(@UploadedFile() file?: UploadedImage) {
    if (!file) {
      throw new BadRequestException('No image file (field "file"), or unsupported type/size');
    }
    // Served statically from /uploads (see main.ts). Callers store this on
    // the article's imageUrl.
    return { imageUrl: `/uploads/${file.filename}` };
  }
}
