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
import { UcdpAdapter } from './ucdp.adapter';
import { ConflictService } from './conflict.service';

@Module({
  controllers: [MacroController, MacroAdminController],
  providers: [
    MacroService,
    TradeService,
    EnergyService,
    ConflictService,
    WorldBankAdapter,
    ImfWeoAdapter,
    OpenSanctionsAdapter,
    ComtradeAdapter,
    EiaAdapter,
    UcdpAdapter,
  ],
  exports: [MacroService, TradeService, EnergyService, ConflictService],
})
export class MacroModule {}
