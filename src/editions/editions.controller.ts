import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { EditionsService } from './editions.service';
import { JwtAuthGuard } from '../common/auth/jwt.guard';

@Controller('editions')
@UseGuards(JwtAuthGuard)
export class EditionsController {
  constructor(private readonly service: EditionsService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll(page, pageSize);
  }

  @Post()
  upsert(@Body() body: { key: string; label: string; enabled?: boolean }) {
    return this.service.upsert(body);
  }

  @Patch(':id/enabled')
  toggle(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.service.toggle(Number(id), body.enabled);
  }
}
