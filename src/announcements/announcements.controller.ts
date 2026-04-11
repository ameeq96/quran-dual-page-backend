import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { JwtAuthGuard } from '../common/auth/jwt.guard';

@Controller('announcements')
@UseGuards(JwtAuthGuard)
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll(page, pageSize);
  }

  @Post()
  upsert(@Body() body: { id?: number; title: string; body: string; active?: boolean; publishAt?: string }) {
    return this.service.upsert({
      ...body,
      publishAt: body.publishAt ? new Date(body.publishAt) : null,
    });
  }

  @Patch(':id/active')
  toggle(@Param('id') id: string, @Body() body: { active: boolean }) {
    return this.service.toggle(Number(id), body.active);
  }
}
