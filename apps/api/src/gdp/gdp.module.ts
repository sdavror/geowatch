import { Module } from '@nestjs/common';
import { AdminGdpController, GdpController } from './gdp.controller';
import { GdpService } from './gdp.service';

@Module({
  controllers: [GdpController, AdminGdpController],
  providers: [GdpService],
  exports: [GdpService],
})
export class GdpModule {}
