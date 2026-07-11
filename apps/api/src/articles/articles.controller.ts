import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ArticlesService } from './articles.service';
import { ListArticlesQueryDto } from './dto/list-articles-query.dto';

class RecordViewDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sessionId?: string;
}

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  findAll(@Query() query: ListArticlesQueryDto) {
    return this.articlesService.findAll(query);
  }

  // Registered before ':id' so "most-read" isn't swallowed by the :id route.
  @Get('most-read')
  findMostRead(@Query('days') days?: string, @Query('limit') limit?: string) {
    return this.articlesService.findMostRead(
      days ? parseInt(days, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.articlesService.findOne(id);
  }

  @Post(':id/view')
  recordView(@Param('id') id: string, @Body() dto: RecordViewDto) {
    return this.articlesService.recordView(id, dto.sessionId);
  }
}
