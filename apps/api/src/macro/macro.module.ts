import { Module } from '@nestjs/common';
import { MacroController, MacroAdminController } from './macro.controller';
import { MacroService } from './macro.service';
import { WorldBankAdapter } from './worldbank.adapter';
import { ImfWeoAdapter } from './imf-weo.adapter';
import { OpenSanctionsAdapter } from './opensanctions.adapter';

@Module({
  controllers: [MacroController, MacroAdminController],
  providers: [MacroService, WorldBankAdapter, ImfWeoAdapter, OpenSanctionsAdapter],
  exports: [MacroService],
})
export class MacroModule {}
