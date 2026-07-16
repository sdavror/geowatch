import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { TokenPayload } from '../auth/jwt.util';

const PRIORITIES = ['urgent', 'high', 'normal'];

class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @ValidateIf((o: CreateTaskDto) => o.deadline !== null && o.deadline !== '')
  @IsDateString()
  deadline?: string | null;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: string;
}

class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @ValidateIf((o: UpdateTaskDto) => o.deadline !== null && o.deadline !== '')
  @IsDateString()
  deadline?: string | null;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: string;
}

@Controller('admin/tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor') // superadmin passes via RolesGuard's owner bypass
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentUser() user: TokenPayload) {
    return this.tasks.list(user.sub);
  }

  @Post()
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: TokenPayload) {
    return this.tasks.create(user.sub, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser() user: TokenPayload) {
    return this.tasks.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: TokenPayload) {
    return this.tasks.remove(user.sub, id);
  }
}
