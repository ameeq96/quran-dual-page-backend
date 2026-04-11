import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/auth/jwt.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll(page, pageSize);
  }

  @Get(':id/sync')
  findSync(@Param('id') id: string) {
    return this.service.findSyncState(Number(id));
  }

  @Patch(':id/active')
  toggleActive(@Param('id') id: string, @Body() body: { active: boolean }) {
    return this.service.toggleActive(Number(id), body.active);
  }
}
