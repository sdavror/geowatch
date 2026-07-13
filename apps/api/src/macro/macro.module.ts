import { Module } from '@nestjs/common';
import { MacroController, MacroAdminController } from './macro.controller';
import { MacroService } from './macro.service';
import { TradeService } from './trade.service';
import { EnergyService } from './energy.service';
import { WorldBankAdapter } from './worldbank.adapter';
import { ImfWeoAdapter } from './imf-weo.adapter';
import { OpenSanctionsAdapter } from './opensanctions.adapter';
import { ComtradeAdapter } from './comtrade.adapter';
import { EiaAdapter } from './eia.adapter';

@Module({
  controllers: [MacroController, MacroAdminController],
  providers: [
    MacroService,
    TradeService,
    EnergyService,
    WorldBankAdapter,
    ImfWeoAdapter,
    OpenSanctionsAdapter,
    ComtradeAdapter,
    EiaAdapter,
  ],
  exports: [MacroService, TradeService, EnergyService],
})
export class MacroModule {}
