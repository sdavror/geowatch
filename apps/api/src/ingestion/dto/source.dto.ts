import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Min, MaxLength } from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  official?: boolean;

  /** ISO 3166-1 alpha-2 of the state an official source speaks for. */
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryId?: string;
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

  @IsOptional()
  @IsBoolean()
  official?: boolean;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryId?: string;
}
