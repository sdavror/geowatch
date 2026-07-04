import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { imageUploadOptions, UploadedImage } from './upload.config';

/**
 * General image upload for any authenticated user — used for article photos
 * (editors) and account avatars (everyone). Returns the served URL.
 */
@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  @Post()
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  upload(@UploadedFile() file?: UploadedImage) {
    if (!file) {
      throw new BadRequestException('No image file (field "file"), or unsupported type/size');
    }
    return { imageUrl: `/uploads/${file.filename}` };
  }
}
