import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { TokenPayload } from '../auth/jwt.util';

class SendMessageDto {
  @IsUUID()
  toId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

@Controller('admin/messages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor') // superadmin passes via RolesGuard's owner bypass
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('peers')
  peers(@CurrentUser() user: TokenPayload) {
    return this.messages.peers(user.sub);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: TokenPayload) {
    return this.messages.unreadCount(user.sub);
  }

  @Get('thread/:peerId')
  thread(@Param('peerId') peerId: string, @CurrentUser() user: TokenPayload) {
    return this.messages.thread(user.sub, peerId);
  }

  @Post()
  send(@Body() dto: SendMessageDto, @CurrentUser() user: TokenPayload) {
    return this.messages.send(user.sub, dto.toId, dto.body);
  }
}
