import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('public/sync')
export class PublicSyncController {
  constructor(private readonly service: UsersService) {}

  @Post('push')
  push(
    @Body()
    body: {
      deviceId: string;
      email?: string | null;
      appVersion?: string | null;
      lastPageNumber?: number | null;
      payload?: Record<string, unknown>;
    },
  ) {
    return this.service.pushSync(body);
  }

  @Get('pull')
  pull(@Query('deviceId') deviceId: string) {
    return this.service.pullSync(deviceId);
  }
}
