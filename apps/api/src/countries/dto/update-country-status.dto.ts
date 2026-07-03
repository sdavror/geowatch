import { IsBoolean, IsIn, IsOptional } from 'class-validator';

const STATUS_VALUES = ['conflict', 'crisis', 'unstable', 'stable'] as const;

export class UpdateCountryStatusDto {
  @IsIn(STATUS_VALUES)
  status!: (typeof STATUS_VALUES)[number];

  @IsOptional()
  @IsBoolean()
  statusOverride?: boolean = true;
}
