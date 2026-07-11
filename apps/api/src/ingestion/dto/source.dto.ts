import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Min, MaxLength } from 'class-validator';

const SOURCE_TYPES = ['wire', 'rss', 'api', 'scraper'];

export class CreateSourceDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsUrl()
  url!: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  type?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  fetchIntervalMinutes?: number;
}

export class UpdateSourceDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  type?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  fetchIntervalMinutes?: number;
}
