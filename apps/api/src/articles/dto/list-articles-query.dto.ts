import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

const CATEGORY_VALUES = ['military', 'economic', 'political', 'humanitarian'] as const;

export class ListArticlesQueryDto {
  @IsOptional()
  @IsIn(CATEGORY_VALUES)
  category?: (typeof CATEGORY_VALUES)[number];

  @IsOptional()
  @IsString()
  countryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
