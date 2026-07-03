import { Controller, Get, Param, Query } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ListArticlesQueryDto } from './dto/list-articles-query.dto';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  findAll(@Query() query: ListArticlesQueryDto) {
    return this.articlesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.articlesService.findOne(id);
  }
}
