import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

const CATEGORY_VALUES = ['military', 'economic', 'political', 'humanitarian'] as const;

export class ListArticlesQueryDto {
  @IsOptional()
  @IsIn(CATEGORY_VALUES)
  category?: (typeof CATEGORY_VALUES)[number];

  // 'editorial' = written in our newsroom (has an author) — analyses and
  // features; 'news' = ingested from external sources (wire/official/TG).
  @IsOptional()
  @IsIn(['editorial', 'news'])
  kind?: 'editorial' | 'news';

  @IsOptional()
  @IsString()
  countryId?: string;

  // Free-text title search — powers the navbar's global search dropdown.
  // Bypasses source-diversity capping (that's a homepage-feed concern, not
  // relevant to "find the story the reader typed").
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
