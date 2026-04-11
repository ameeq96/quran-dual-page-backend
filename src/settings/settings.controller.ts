import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../common/auth/jwt.guard';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  getSettings(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.getSettings(page, pageSize);
  }

  @Post()
  upsertSetting(@Body() body: { id?: number; key: string; value: string }) {
    return this.service.upsertSetting(body);
  }

  @Get('flags')
  getFlags(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.getFlags(page, pageSize);
  }

  @Patch('flags/:id')
  toggleFlag(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.service.toggleFlag(Number(id), body.enabled);
  }
}
