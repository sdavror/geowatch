import { Module } from '@nestjs/common';
import { MacroController, MacroAdminController } from './macro.controller';
import { MacroService } from './macro.service';
import { TradeService } from './trade.service';
import { WorldBankAdapter } from './worldbank.adapter';
import { ImfWeoAdapter } from './imf-weo.adapter';
import { OpenSanctionsAdapter } from './opensanctions.adapter';
import { ComtradeAdapter } from './comtrade.adapter';

@Module({
  controllers: [MacroController, MacroAdminController],
  providers: [MacroService, TradeService, WorldBankAdapter, ImfWeoAdapter, OpenSanctionsAdapter, ComtradeAdapter],
  exports: [MacroService, TradeService],
})
export class MacroModule {}
