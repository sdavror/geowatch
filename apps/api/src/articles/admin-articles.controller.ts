import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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

@Controller('admin/articles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor') // superadmin passes via RolesGuard's owner bypass
export class AdminArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  list() {
    return this.articlesService.findAllAdmin();
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
