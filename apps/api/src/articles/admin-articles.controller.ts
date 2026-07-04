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
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomBytes } from 'crypto';
import { ArticlesService } from './articles.service';
import { CreateArticleDto, UpdateArticleDto } from './dto/admin-article.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { TokenPayload } from '../auth/jwt.util';

// Minimal shape of a multer upload — avoids depending on @types/multer.
interface UploadedImage {
  filename: string;
  mimetype: string;
  size: number;
}

const UPLOAD_DIR = './uploads';
const ALLOWED_IMAGE = /^image\/(png|jpe?g|webp|gif|avif)$/;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

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
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const name = randomBytes(12).toString('hex') + extname(file.originalname).toLowerCase();
          cb(null, name);
        },
      }),
      limits: { fileSize: MAX_IMAGE_BYTES },
      fileFilter: (_req, file, cb) => {
        cb(null, ALLOWED_IMAGE.test(file.mimetype));
      },
    }),
  )
  upload(@UploadedFile() file?: UploadedImage) {
    if (!file) {
      throw new BadRequestException('No image file (field "file"), or unsupported type/size');
    }
    // Served statically from /uploads (see main.ts). Callers store this on
    // the article's imageUrl.
    return { imageUrl: `/uploads/${file.filename}` };
  }
}
