import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { MediaLibraryController } from './media-library.controller';

@Module({
  controllers: [UploadController, MediaLibraryController],
})
export class UploadModule {}
