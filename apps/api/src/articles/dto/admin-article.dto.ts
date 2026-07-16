import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const CATEGORIES = ['military', 'economic', 'political', 'humanitarian'];
const STATUSES = ['idea', 'draft', 'in_review', 'ready', 'scheduled', 'published', 'archived'];

export class CreateArticleDto {
  @IsString()
  @MinLength(4)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  aiSummary?: string;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: string;

  @IsOptional()
  @IsString()
  countryId?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  aiSummary?: string;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: string;

  @IsOptional()
  @IsString()
  countryId?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  // Empty string clears the schedule (JSON null also works via the service).
  @IsOptional()
  @ValidateIf((o: UpdateArticleDto) => o.scheduledAt !== null && o.scheduledAt !== '')
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsArray()
  tags?: string[];
}
